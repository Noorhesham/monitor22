import express from "express";
import fetch from "node-fetch";
import { HeaderMonitorService } from "../services/headerMonitorService.js";
import { HeaderSettingsService } from "../services/headerSettingsService.js";
import dotenv from "dotenv";
import { loadSettings } from "../utils/settingsStorage.js";
import { getDb } from "../database/db.js"; // Import getDb for database access

// Load environment variables
dotenv.config();

const router = express.Router();

// Load API credentials from environment variables
const FRACBRAIN_API_BASE = process.env.FRACBRAIN_API_BASE;
const getFracBrainToken = () => process.env.FRACBRAIN_TOKEN || process.env.VITE_FRACBRAIN_TOKEN;

if (!FRACBRAIN_API_BASE) {
  console.error("FATAL ERROR in monitoring routes: FRACBRAIN_API_BASE not defined.");
  // We shouldn't exit here, but log the error. Let requests fail.
}

// --- Helper Function: Get Header Type (adapted from monitorService.js) ---
// We need this here to filter headers based on settings before sending to frontend
async function getHeaderTypeForFilter(headerName, settings) {
  const { patternCategories } = settings;

  if (!headerName || !patternCategories) return null;

  const lowerHeaderName = headerName.toLowerCase();

  // Check all defined categories
  for (const categoryKey in patternCategories) {
    const category = patternCategories[categoryKey];
    let isMatch = false;

    // Check positive patterns
    if (category.patterns?.some((pattern) => lowerHeaderName.includes(pattern.toLowerCase()))) {
      isMatch = true;
    }

    // Check negative patterns - if any negative match, it's not this type
    if (isMatch && category.negativePatterns?.some((pattern) => lowerHeaderName.includes(pattern.toLowerCase()))) {
      isMatch = false;
    }

    if (isMatch) {
      return categoryKey; // Return the category key (e.g., 'pressure', 'battery')
    }
  }

  return null; // No matching category found
}
// --- End Helper Function ---

// Get current monitoring status
router.get("/", async (req, res) => {
  try {
    const { headerValues, alerts } = await HeaderMonitorService.monitorAllHeaders();
    res.json({
      headerValues,
      alerts,
      lastUpdated: new Date(),
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error("Error getting monitoring status:", error);
    res.status(500).json({ error: "Failed to get monitoring status" });
  }
});

// Upsert projects into the active_projects table
export async function upsertActiveProjects(stages) {
  if (!Array.isArray(stages) || stages.length === 0) return;

  const db = await getDb();

  // Check the actual table structure first
  const tableInfo = await db.all("PRAGMA table_info(active_projects)");
  const columns = tableInfo.map((col) => col.name);
  console.log("Active projects table columns:", columns);

  // Check for required columns
  const hasStageIdColumn = columns.includes("stage_id");
  const hasStageNameColumn = columns.includes("stage_name");
  const hasWellNumberColumn = columns.includes("well_number");

  // Check if we're already in a transaction
  let inTransaction = false;
  try {
    const transactionStatus = await db.get("PRAGMA transaction_status");
    inTransaction = transactionStatus && transactionStatus.transaction_status !== 0;
  } catch (error) {
    console.log("Could not check transaction status, assuming no transaction is active");
  }

  // Only begin a transaction if we're not already in one
  if (!inTransaction) {
    await db.run("BEGIN TRANSACTION;");
  }

  try {
    // Build the SQL dynamically based on available columns
    let sql = `
            INSERT INTO active_projects (
                project_id, company_id, company_name, company_short_name, project_name
        `;

    // Add stage_name if it exists
    if (hasStageNameColumn) {
      sql += `, stage_name`;
    }

    // Add well_number if it exists
    if (hasWellNumberColumn) {
      sql += `, well_number`;
    }

    // Add stage_id if it exists
    if (hasStageIdColumn) {
      sql += `, stage_id`;
    }

    sql += `, last_active_at, is_deleted)
            VALUES (?, ?, ?, ?, ?`;

    // Add placeholders for optional columns
    if (hasStageNameColumn) {
      sql += `, ?`;
    }

    if (hasWellNumberColumn) {
      sql += `, ?`;
    }

    if (hasStageIdColumn) {
      sql += `, ?`;
    }

    sql += `, CURRENT_TIMESTAMP, 0)
            ON CONFLICT(project_id) DO UPDATE SET
                company_id = excluded.company_id,
                company_name = excluded.company_name,
                company_short_name = excluded.company_short_name,
                project_name = excluded.project_name`;

    // Add stage_name update if it exists
    if (hasStageNameColumn) {
      sql += `,
                stage_name = excluded.stage_name`;
    }

    // Add well_number update if it exists
    if (hasWellNumberColumn) {
      sql += `,
                well_number = excluded.well_number`;
    }

    // Add stage_id update if it exists
    if (hasStageIdColumn) {
      sql += `,
                stage_id = excluded.stage_id`;
    }

    sql += `,
                last_active_at = CURRENT_TIMESTAMP,
                is_deleted = 0`;

    const stmt = await db.prepare(sql);

    for (const stage of stages) {
      try {
        // Extract project info from stage data, using defaults if needed
        const projectId = stage.projectId || stage.project_id;
        const projectName = stage.projectName || stage.project_name || "Unknown Project";

        // Company info might be nested in a company object or directly on stage
        const companyInfo = stage.company || {};
        const companyId = stage.companyId || stage.company_id || companyInfo.id || null;
        const companyName = stage.companyName || stage.company_name || companyInfo.name || "Unknown Company";
        const companyShortName = stage.companyShortName || stage.company_short_name || companyInfo.shortName || "";

        // Stage info
        const stageId = stage.stageId || stage.stage_id || null;
        const stageName = stage.stageName || stage.stage_name || "Unknown Stage";

        // Well info
        const wellNumber = stage.wellNumber || stage.well_number || "Unknown Well";

        if (projectId) {
          // Build parameters array based on which columns are in the table
          let params = [projectId, companyId, companyName, companyShortName, projectName];

          if (hasStageNameColumn) {
            params.push(stageName);
          }

          if (hasWellNumberColumn) {
            params.push(wellNumber);
          }

          if (hasStageIdColumn) {
            params.push(stageId);
          }

          await stmt.run(...params);
          console.log(`Upserted project: ${projectName} (ID: ${projectId})`);
        } else {
          console.warn("Skipping upsert for stage due to missing project ID:", stage.stageId || "unknown stage");
        }
      } catch (err) {
        console.warn(`Failed to upsert project for stage ${stage.stageId || "unknown"}:`, err.message);
        // Continue with next stage instead of failing the entire batch
      }
    }

    await stmt.finalize();

    // Only commit if we started the transaction
    if (!inTransaction) {
      await db.run("COMMIT;");
    }

    console.log(`Upserted/updated info for ${stages.length} projects in active_projects table.`);
  } catch (error) {
    console.error("Error upserting active projects:", error);

    // Only rollback if we started the transaction
    if (!inTransaction) {
      try {
        await db.run("ROLLBACK;"); // Rollback transaction on error
      } catch (rollbackError) {
        console.error("Error during rollback:", rollbackError);
      }
    }

    throw error; // Re-throw error to be caught by the route handler
  }
}

// Get active stages AND upsert project info
router.get("/active-stages", async (req, res) => {
  const token = getFracBrainToken();
  if (!FRACBRAIN_API_BASE || !token) {
    return res.status(500).json({ error: "API credentials not configured on the server" });
  }
  try {
    const apiHeaders = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    console.log("Fetching active stages from FracBrain API...");
    const stagesResponse = await fetch(`${FRACBRAIN_API_BASE}/stages/active/stages`, {
      headers: apiHeaders,
      credentials: "omit",
    });

    if (!stagesResponse.ok) {
      const errorText = await stagesResponse.text();
      throw new Error(`FracBrain API error: ${stagesResponse.status} - ${errorText}`);
    }

    const stagesData = await stagesResponse.json();
    const activeStages = stagesData.stages || [];
    console.log(`Successfully fetched ${activeStages.length} active stages.`);

    // Add detailed debug logging
    if (activeStages.length > 0) {
      const firstStage = activeStages[0];
      console.log("First stage data structure:", JSON.stringify(firstStage, null, 2));

      // Log important fields for debugging
      console.log("Stage properties:", Object.keys(firstStage));
      console.log("Stage IDs:", {
        stageId: firstStage.stageId || firstStage.stage_id,
        projectId: firstStage.projectId || firstStage.project_id,
        companyId: firstStage.companyId || firstStage.company_id,
      });
    } else {
      console.log("No active stages found.");
      // Return empty array rather than failing
      return res.json({
        stages: [],
        lastUpdated: new Date(),
        timestamp: Date.now(),
      });
    }

    // ---- NEW: Upsert project info into the database ----
    try {
      await upsertActiveProjects(activeStages);
      console.log("Successfully upserted project info from stages.");
    } catch (dbError) {
      // Log but don't fail the whole request
      console.error("Error upserting project info:", dbError);
      // Continue to return stages data anyway
    }
    // --------------------------------------------------

    res.json({
      stages: activeStages, // Send the original stages array
      lastUpdated: new Date(),
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error("Error in /active-stages route:", error.message);
    res.status(500).json({ error: "Failed to get active stages or update projects", details: error.message });
  }
});

// Get monitored headers - Added for frontend compatibility
router.get("/monitored-headers", async (req, res) => {
  try {
    const db = await getDb();

    // Join with active_projects to get company and project names
    const monitoredHeaders = await db.all(`
      SELECT 
        phs.*,
        ap.company_name,
        ap.company_short_name,
        ap.project_name
      FROM 
        project_header_settings phs
      LEFT JOIN
        active_projects ap ON phs.project_id = ap.project_id
      WHERE 
        phs.is_monitored = 1
      ORDER BY
        phs.updated_at DESC
    `);

    console.log(`GET /monitored-headers: Found ${monitoredHeaders.length} headers.`);
    res.json({
      headers: monitoredHeaders, // Send the actual headers with project info
      lastUpdated: new Date(),
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error("Error getting monitored headers:", error);
    res.status(500).json({ error: "Failed to get monitored headers" });
  }
});

// Route to get all monitored header values
router.get("/header-values", async (req, res) => {
  try {
    const includeRawData = req.query.includeRawData === "true";
    const result = await HeaderMonitorService.monitorAllHeaders({ cleanupDuplicates: false });

    // Make sure we're returning an array of header values with state information
    const headerValues = Array.isArray(result.headerValues) ? result.headerValues : [];

    console.log(`Returning ${headerValues.length} header values with state information`);

    // Log a sample of the first header value to verify data structure
    if (headerValues.length > 0) {
      console.log("Sample header value:", {
        id: headerValues[0].id,
        value: headerValues[0].value,
        state: headerValues[0].state || "unknown",
      });
    }

    res.json(headerValues);
  } catch (error) {
    console.error("Error getting header values:", error);
    res.status(500).json({ error: "Failed to get header values" });
  }
});

// Get alerts - Added for frontend compatibility
router.get("/alerts", async (req, res) => {
  try {
    // Use the new method to get active alerts with snooze info
    const alerts = await HeaderMonitorService.getActiveAlerts();

    // Filter out snoozed alerts if requested
    const includeSnoozed = req.query.includeSnoozed === "true";
    const filteredAlerts = includeSnoozed ? alerts : alerts.filter((alert) => !alert.snoozed);

    res.json({
      alerts: filteredAlerts || [],
      lastUpdated: new Date(),
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error("Error getting alerts:", error);
    res.status(500).json({ error: "Failed to get alerts" });
  }
});

// Get FILTERED headers for a specific stage
router.get("/headers/:stageId", async (req, res) => {
  const { stageId } = req.params;
  const token = getFracBrainToken();
  if (!FRACBRAIN_API_BASE || !token) {
    return res.status(500).json({ error: "API credentials not configured on the server" });
  }
  try {
    // 1. Load current settings
    const settings = await loadSettings();
    if (!settings || !settings.patternCategories) {
      throw new Error("Could not load settings or pattern categories.");
    }

    // 2. Fetch headers from FracBrain API
    const apiHeaders = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    console.log(`Fetching headers for stage ${stageId} from FracBrain API...`);
    const stageHeadersResponse = await fetch(`${FRACBRAIN_API_BASE}/stages/${stageId}/headers`, {
      headers: apiHeaders,
      credentials: "omit",
    });

    if (!stageHeadersResponse.ok) {
      const errorText = await stageHeadersResponse.text();
      throw new Error(
        `FracBrain API error fetching headers for stage ${stageId}: ${stageHeadersResponse.status} - ${errorText}`
      );
    }

    const headersData = await stageHeadersResponse.json();
    const allHeaders = headersData.headers || [];
    console.log(`Successfully fetched ${allHeaders.length} total headers for stage ${stageId}.`);

    // 3. Filter headers based on settings
    const filteredHeaders = [];
    for (const header of allHeaders) {
      const headerType = await getHeaderTypeForFilter(header.name, settings);
      if (headerType !== null) {
        // Only include headers that match a defined category type
        filteredHeaders.push(header);
      }
    }
    console.log(`Filtered down to ${filteredHeaders.length} headers based on settings for stage ${stageId}.`);

    // 4. Return filtered headers
    res.json({
      headers: filteredHeaders, // Send only filtered headers
      lastUpdated: new Date(),
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error(`Error getting filtered headers for stage ${stageId}:`, error.message);
    res.status(500).json({ error: `Failed to get filtered headers for stage ${stageId}`, details: error.message });
  }
});

// Get monitoring status for a project
// TODO: Implement MonitoringService.getProjectMonitoringStatus or remove/update this route
router.get("/project/:projectId/status", async (req, res) => {
  try {
    const { projectId } = req.params;
    // const status = await MonitoringService.getProjectMonitoringStatus(projectId);
    res.status(501).json({ error: "Endpoint not implemented" });
  } catch (error) {
    console.error("Error getting project monitoring status:", error);
    res.status(500).json({ error: "Failed to get monitoring status" });
  }
});

// Update header monitoring settings
// TODO: Implement MonitoringService.setHeaderMonitoring or remove/update this route
router.post("/header", async (req, res) => {
  try {
    const { projectId, headerId, headerName, threshold, isActive } = req.body;
    // ... implementation ...
    res.status(501).json({ error: "Endpoint not implemented" });
  } catch (error) {
    console.error("Error updating header monitoring:", error);
    res.status(500).json({ error: "Failed to update header monitoring" });
  }
});

// Update header value
// TODO: Implement MonitoringService.updateHeaderValue or remove/update this route
router.post("/header/:headerId/value", async (req, res) => {
  try {
    const { headerId } = req.params;
    const { projectId, value, stageId } = req.body;
    // ... implementation ...
    res.status(501).json({ error: "Endpoint not implemented" });
  } catch (error) {
    console.error("Error updating header value:", error);
    res.status(500).json({ error: "Failed to update header value" });
  }
});

// Cleanup inactive projects (can be called by a cron job)
// TODO: Implement MonitoringService.cleanupInactiveProjects or remove/update this route
router.post("/cleanup", async (req, res) => {
  try {
    // const inactiveProjects = await MonitoringService.cleanupInactiveProjects();
    res.status(501).json({ error: "Endpoint not implemented" });
  } catch (error) {
    console.error("Error during cleanup:", error);
    res.status(500).json({ error: "Failed to cleanup inactive projects" });
  }
});

// Add a header to be monitored - NEW POST ROUTE
router.post("/monitored-headers", async (req, res) => {
  try {
    const { projectId, headerId, headerName, companyName, projectName, settings } = req.body;

    // Basic validation
    if (!projectId || !headerId || !headerName) {
      return res.status(400).json({ error: "Missing required fields: projectId, headerId, headerName" });
    }

    // Prepare data for the service
    const headerDataForService = {
      id: headerId, // Assuming service expects 'id'
      name: headerName,
      threshold: settings?.threshold, // Extract from nested settings if passed
      alertDuration: settings?.alertDuration,
      frozenThreshold: settings?.frozenThreshold,
      isMonitored: true, // Mark as monitored
    };

    // Use HeaderSettingsService to save/update the setting
    const success = await HeaderSettingsService.upsertHeaderSettings(projectId, headerDataForService);

    if (success) {
      console.log(`Successfully added/updated monitored header ${headerId} for project ${projectId}`);
      // Fetch the newly saved/updated record to return the full object
      const db = await getDb();
      const newRecord = await db.get("SELECT * FROM project_header_settings WHERE project_id = ? AND header_id = ?", [
        projectId,
        headerId,
      ]);
      // Map DB record to frontend expected structure if necessary (depends on frontend needs)
      const result = newRecord
        ? {
            projectId: newRecord.project_id,
            headerId: newRecord.header_id,
            headerName: newRecord.header_name,
            companyName, // Pass back from original request
            projectName,
            settings: {
              threshold: newRecord.threshold,
              alertDuration: newRecord.alert_duration,
              frozenThreshold: newRecord.frozen_threshold,
            },
            isMonitored: newRecord.is_monitored === 1, // Convert to boolean
            // Add other fields if needed by frontend
          }
        : null;

      if (!result) throw new Error("Failed to retrieve the saved header record.");

      res.status(201).json(result); // Return the saved record structure
    } else {
      throw new Error("Failed to save monitored header settings to database");
    }
  } catch (error) {
    console.error("Error adding monitored header:", error);
    res.status(500).json({ error: "Failed to add monitored header", details: error.message });
  }
});

// Update settings for a specific monitored header - NEW PUT ROUTE
router.put("/monitored-headers/:headerId/settings", async (req, res) => {
  const { headerId } = req.params;
  const settings = req.body; // { threshold: number|null, alertDuration: number|null, frozenThreshold: number|null } or null
  console.log(settings);
  // We need the projectId associated with this headerId to update it in the DB.
  // This requires fetching the header setting first or getting projectId from request body.
  // Let's assume for now the frontend *could* send projectId, but it's better to fetch.

  try {
    console.log(`Updating settings for header ${headerId}:`, settings);

    // 1. Find the project_id for this header_id (assuming headerId is unique across projects for simplicity here)
    // A better approach might require projectId in the route or request body.
    const db = await getDb();
    const headerRecord = await db.get("SELECT project_id FROM project_header_settings WHERE header_id = ? LIMIT 1", [
      headerId,
    ]);

    if (!headerRecord || !headerRecord.project_id) {
      return res.status(404).json({ error: `Monitored header with ID ${headerId} not found.` });
    }
    const projectId = headerRecord.project_id;

    // 2. Prepare data for update (using upsert for simplicity)
    // Need header name too - fetch it or require it from client?
    // Fetching name to ensure consistency:
    const headerNameRecord = await db.get(
      "SELECT header_name FROM project_header_settings WHERE header_id = ? LIMIT 1",
      [headerId]
    );
    const headerName = headerNameRecord?.header_name || "Unknown"; // Fallback

    const headerDataForService = {
      id: headerId,
      name: headerName,
      threshold: Number(settings?.threshold) || null, // Ensure numeric conversion
      alertDuration: settings?.alertDuration,
      frozenThreshold: settings?.frozenThreshold,
      isMonitored: true, // Keep it monitored when settings change
    };

    // 3. Update using the service
    const success = await HeaderSettingsService.upsertHeaderSettings(projectId, headerDataForService);

    if (success) {
      console.log(`Successfully updated settings for header ${headerId}`);
      // Fetch the updated record to return the full structure expected by frontend
      const updatedRecord = await db.get(
        "SELECT threshold, alert_duration, frozen_threshold FROM project_header_settings WHERE project_id = ? AND header_id = ?",
        [projectId, headerId]
      );
      res.json({
        threshold: updatedRecord.threshold,
        alertDuration: updatedRecord.alert_duration,
        frozenThreshold: updatedRecord.frozen_threshold,
      });
    } else {
      throw new Error("Database update failed for header settings.");
    }
  } catch (error) {
    console.error(`Error updating settings for header ${headerId}:`, error);
    res.status(500).json({ error: `Failed to update settings for header ${headerId}`, details: error.message });
  }
});

// Remove a header from monitoring - NEW DELETE ROUTE
router.delete("/monitored-headers/:headerId", async (req, res) => {
  const { headerId } = req.params;
  try {
    // 1. Find the project_id for this header_id
    const db = await getDb();
    const headerRecord = await db.get("SELECT project_id FROM project_header_settings WHERE header_id = ? LIMIT 1", [
      headerId,
    ]);

    if (!headerRecord || !headerRecord.project_id) {
      console.warn(`Attempted to delete non-existent monitored header ${headerId}`);
      // Still return success as the end state (not monitored) is achieved
      return res.status(204).send();
    }
    const projectId = headerRecord.project_id;

    // 2. Use service to mark as not monitored
    const success = await HeaderSettingsService.removeHeaderMonitoring(projectId, headerId);

    if (success) {
      console.log(`Successfully removed header ${headerId} from monitoring for project ${projectId}`);
      res.status(204).send(); // Success, no content
    } else {
      throw new Error("Database update failed to remove header monitoring.");
    }
  } catch (error) {
    console.error(`Error removing monitored header ${headerId}:`, error);
    res.status(500).json({ error: `Failed to remove monitored header ${headerId}`, details: error.message });
  }
});

// Remove all headers for a project - NEW DELETE ROUTE
router.delete("/monitored-headers/project/:projectId", async (req, res) => {
  const { projectId } = req.params;
  try {
    const db = await getDb();
    // Instead of deleting, set is_monitored to false for all headers of this project
    const result = await db.run(
      `
            UPDATE project_header_settings
            SET is_monitored = 0, updated_at = CURRENT_TIMESTAMP
            WHERE project_id = ?
        `,
      [projectId]
    );

    console.log(`Removed ${result.changes} headers from monitoring for project ${projectId}`);
    res.status(204).send(); // Success, no content
  } catch (error) {
    console.error(`Error removing headers for project ${projectId}:`, error);
    res.status(500).json({ error: `Failed to remove headers for project ${projectId}`, details: error.message });
  }
});

// Debug endpoint to check raw API response
router.get("/debug/:headerId", async (req, res) => {
  const { headerId } = req.params;
  const token = getFracBrainToken();
  if (!FRACBRAIN_API_BASE || !token) {
    return res.status(500).json({ error: "API credentials not configured on the server" });
  }

  try {
    const apiHeaders = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    console.log(`DEBUG: Fetching raw data for header ${headerId}`);
    const apiUrl = `${FRACBRAIN_API_BASE}/stages/datum/${headerId}`;
    console.log(`DEBUG: API URL: ${apiUrl}`);

    const response = await fetch(apiUrl, {
      headers: apiHeaders,
      credentials: "omit",
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`FracBrain API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log(`DEBUG: Raw API response for ${headerId}:`, JSON.stringify(data, null, 2));

    // Check what HeaderMonitorService would extract
    let value = null;
    if (data && data.datum && data.datum.value !== undefined) {
      value = data.datum.value;
    }

    res.json({
      rawResponse: data,
      extractedValue: value,
      headerId,
      apiUrl,
    });
  } catch (error) {
    console.error(`Error in debug endpoint for header ${headerId}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Add alert management endpoints
router.post("/alerts/:alertId/snooze", async (req, res) => {
  try {
    const { alertId } = req.params;
    const { duration } = req.body;

    if (!duration || typeof duration !== "number") {
      return res.status(400).json({ error: "Duration is required and must be a number (in seconds)" });
    }

    // Store the snooze information in the database
    const db = await getDb();
    const now = new Date();
    const expiration = new Date(now.getTime() + duration * 1000); // Convert seconds to milliseconds

    await db.run("INSERT INTO alert_snoozes (alert_id, snooze_until, created_at) VALUES (?, ?, ?)", [
      alertId,
      expiration.toISOString(),
      now.toISOString(),
    ]);

    // Get alert details for response
    const alertInfo = await db.get("SELECT * FROM alerts WHERE id = ?", [alertId]);

    res.json({
      id: alertId,
      snoozed: true,
      snoozeUntil: expiration.toISOString(),
      message: `Alert snoozed until ${expiration.toLocaleString()}`,
    });
  } catch (error) {
    console.error("Error snoozing alert:", error);
    res.status(500).json({ error: "Failed to snooze alert" });
  }
});

router.delete("/alerts/:alertId", async (req, res) => {
  try {
    const { alertId } = req.params;

    // In a real application, you would update the database
    // For now, we'll just acknowledge the request
    const db = await getDb();
    await db.run("UPDATE alerts SET dismissed = 1 WHERE id = ?", [alertId]);

    res.status(200).json({ message: "Alert dismissed" });
  } catch (error) {
    console.error("Error dismissing alert:", error);
    res.status(500).json({ error: "Failed to dismiss alert" });
  }
});

// Manual stage transition endpoint for maintaining header monitoring across stage changes
router.post("/transition-stage", async (req, res) => {
  try {
    const { oldStageId, newStageId } = req.body;

    if (!oldStageId || !newStageId) {
      return res.status(400).json({ error: "Both oldStageId and newStageId are required" });
    }

    console.log(`Manual stage transition request: ${oldStageId} -> ${newStageId}`);

    const success = await HeaderMonitorService.updateMonitoredHeadersForNewStage(oldStageId, newStageId);

    if (success) {
      res.json({
        success: true,
        message: "Successfully transitioned monitored headers to new stage",
        oldStageId,
        newStageId,
      });
    } else {
      throw new Error("Failed to transition headers");
    }
  } catch (error) {
    console.error("Error in manual stage transition:", error);
    res.status(500).json({
      error: "Failed to transition to new stage",
      details: error.message,
      oldStageId: req.body.oldStageId,
      newStageId: req.body.newStageId,
    });
  }
});

// Manually clean up duplicate headers
router.post("/cleanup-duplicate-headers", async (req, res) => {
  try {
    console.log("Manual duplicate header cleanup requested");

    const cleanupCount = await HeaderMonitorService.cleanupDuplicateHeaders();

    res.json({
      success: true,
      message: `Successfully cleaned up ${cleanupCount} duplicate headers`,
      count: cleanupCount,
    });
  } catch (error) {
    console.error("Error in manual duplicate header cleanup:", error);
    res.status(500).json({
      error: "Failed to clean up duplicate headers",
      details: error.message,
    });
  }
});

// Export the router
export { router };
export default router;
