import { HeaderSettingsService } from "./headerSettingsService.js";
import { getDb } from "../database/db.js";
import fetch from "node-fetch";
import dotenv from "dotenv";
import { loadSettings } from "../utils/settingsStorage.js";

// Reload environment variables
dotenv.config();

// Get token for API calls
const getFracBrainToken = () => {
  return process.env.FRACBRAIN_TOKEN || process.env.VITE_FRACBRAIN_TOKEN;
};

const FRACBRAIN_API_BASE = process.env.FRACBRAIN_API_BASE || "https://master.api.fracbrain.com/api/v1";

export class HeaderMonitorService {
  /**
   * Get all monitored headers from the database
   */
  static async getAllMonitoredHeaders() {
    try {
      console.log("Fetching monitored headers from database...");
      const db = await getDb();

      // First, check if stage_id column exists in active_projects table
      const tableInfo = await db.all("PRAGMA table_info(active_projects)");
      const stageIdColumnExists = tableInfo.some((column) => column.name === "stage_id");

      // Construct query based on column existence
      let query = `
        SELECT 
          phs.*,
          ap.company_id,
          ap.company_name,
          ap.project_name
      `;

      if (stageIdColumnExists) {
        query += `, ap.stage_id`;
      }

      query += `
        FROM project_header_settings phs
        JOIN active_projects ap ON ap.project_id = phs.project_id
        WHERE phs.is_monitored = 1
        AND ap.is_deleted = 0
      `;

      const headers = await db.all(query);
      console.log(headers, "headers active projects");
      // If stage_id doesn't exist but we need it, use a default value
      if (!stageIdColumnExists) {
        headers.forEach((header) => {
          if (!header.stage_id) {
            header.stage_id = `stage-${header.project_id}`; // Use a reasonable default
          }
        });
      }

      console.log(`Found ${headers.length} monitored headers in database`);
      return headers;
    } catch (error) {
      console.error("Error getting monitored headers:", error);
      return [];
    }
  }

  /**
   * Fetch current value for a header from FracBrain API
   */
  static async fetchHeaderValue(headerId) {
    try {
      console.log(`Fetching value for header ${headerId} from FracBrain API`);

      // Get the latest token
      const token = getFracBrainToken();
      if (!token) {
        console.error("No FracBrain API token found in environment variables");
        throw new Error("API authentication token not available");
      }

      const apiUrl = `${FRACBRAIN_API_BASE}/stages/datum/${headerId}`;
      console.log(`Making API call to: ${apiUrl}`);

      const response = await fetch(apiUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        credentials: "omit",
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        console.error(`API Error (${response.status}): ${errorText}`);
        throw new Error(`API Error: ${response.status}${errorText ? ` - ${errorText}` : ""}`);
      }

      const data = await response.json();

      // Log the raw response structure to help debug (truncated for readability)
      // console.debug(
      //   `Raw API response structure for ${headerId}:`,
      //   JSON.stringify(data, null, 2).substring(0, 500) + "..."
      // );

      // Extract the last value and its corresponding timestamp
      let latestValue = null;
      let timestamp = null;
      let state = data?.data?.state || null;

      // Function to safely extract timestamp from data point
      const getTimestampFromDataPoint = (dataPoint) => {
        if (Array.isArray(dataPoint) && dataPoint.length >= 2) {
          return dataPoint[0]; // Timestamp is first element in array format
        } else if (dataPoint && typeof dataPoint === "object" && dataPoint.timestamp) {
          return dataPoint.timestamp;
        }
        return null;
      };

      // Check for datum.value structure (primary expected format)
      if (data?.datum?.value !== undefined) {
        latestValue = Number(data.datum.value);
        timestamp = data.datum.timestamp;
      }
      // Check for data.data array (alternative format)
      else if (data?.data?.data && Array.isArray(data.data.data)) {
        const dataArray = data.data.data;

        // Find the last non-null value and its timestamp
        for (let i = dataArray.length - 1; i >= 0; i--) {
          const dataPoint = dataArray[i];

          if (dataPoint !== null && dataPoint !== undefined) {
            if (Array.isArray(dataPoint)) {
              latestValue = dataPoint[1] !== null ? Number(dataPoint[1]) : null;
              timestamp = dataPoint[0];
            } else if (typeof dataPoint === "object") {
              latestValue = dataPoint.value !== undefined ? Number(dataPoint.value) : null;
              timestamp = dataPoint.timestamp;
            } else {
              latestValue = Number(dataPoint);
              timestamp = getTimestampFromDataPoint(dataArray[i]) || data.data.endTimestamp;
            }

            if (latestValue !== null && !isNaN(latestValue)) {
              break; // Found a valid value, stop searching
            }
          }
        }

        // If no timestamp was found in the data points, use endpoint timestamps
        if (!timestamp) {
          timestamp = data.data.endTimestamp || data.data.startTimestamp;
        }
      }
      // Check for simple value property
      else if (data?.value !== undefined) {
        latestValue = Number(data.value);
        timestamp = data.timestamp;
      }

      // Only use current time as absolute fallback
      if (!timestamp) {
        console.warn(`No timestamp found in API response for header ${headerId}, using current time`);
        timestamp = Date.now();
      }

      // Ensure timestamp is in ISO format
      const isoTimestamp = new Date(timestamp).toISOString();

      console.log(
        `Fetched latest value for header ${headerId}: ${latestValue}, timestamp: ${isoTimestamp}, state: ${state}`
      );
      return {
        value: latestValue,
        state: state,
        timestamp: isoTimestamp,
        rawData: data,
        originalTimestamp: timestamp, // Preserve the original timestamp
      };
    } catch (error) {
      console.error(`Error fetching header value for ${headerId}:`, error);
      return {
        value: null,
        state: null,
        timestamp: new Date().toISOString(),
        error: error.message,
      };
    }
  }

  /**
   * Check a header value against its threshold and update its state
   */
  static async checkHeaderValue(projectId, headerId, currentValue, headerState = null) {
    try {
      // 1. Get header configuration
      const settings = await HeaderSettingsService.getProjectHeaderSettings(projectId);
      const headerConfig = settings.find((s) => s.header_id === headerId);
      console.log(headerConfig, "headerConfig");
      if (!headerConfig) {
        console.warn(`No configuration found for header ${headerId} in project ${projectId}`);
        return null;
      }

      // 2. Skip non-monitored headers
      if (!headerConfig.is_monitored) {
        console.log(`Header ${headerId} is not monitored`);
        return null;
      }

      // 3. Get current value if not provided
      if (currentValue === undefined) {
        const result = await this.fetchHeaderValue(headerId);
        console.log(`Fetched value for header ${headerId}:`, result);
        currentValue = result.value;
        headerState = result.state;
      }

      // 4. Only process LOADING state headers
      if (headerState !== "LOADING") {
        console.log(`Skipping checks for non-LOADING header (${headerState})`);
        await HeaderSettingsService.updateHeaderValueAndState(projectId, headerId, currentValue, headerState);
        return this.createResponse(currentValue, headerState, headerConfig);
      }

      // 5. Alert detection pipeline
      let alert = null;
      alert = alert || (await this.checkFrozenAlert(projectId, headerConfig, currentValue, headerState));
      alert = alert || (await this.checkThresholdAlert(projectId, headerConfig, currentValue, headerState));

      // 6. Update header state with latest values
      await HeaderSettingsService.updateHeaderValueAndState(projectId, headerId, currentValue, headerState);

      return this.createResponse(currentValue, headerState, headerConfig, alert);
    } catch (error) {
      console.error(`Header check failed for ${headerId}:`, error);
      return null;
    }
  }

  // ======================
  // HELPER FUNCTIONS
  // ======================
  static async isThresholdType(headerName) {
    // Case-insensitive check for common threshold-based headers
    const thresholdHeaders = ["pressure", "battery", "temperature", "level"];
    return thresholdHeaders.some((type) => headerName.toLowerCase().includes(type.toLowerCase()));
  }
  static async setInitialExceededTime(projectId, headerId, timestamp) {
    try {
      const db = await getDb();
      const tableName = "project_header_settings"; // Change to 'project_header_settings' if that's the correct table

      // Check if the row exists
      const row = await db.get(`SELECT id FROM ${tableName} WHERE project_id = ? AND header_id = ?`, [
        projectId,
        headerId,
      ]);

      const isoTimestamp = new Date(timestamp).toISOString();
      if (row) {
        // Update existing row
        await db.run(`UPDATE ${tableName} SET first_exceeded_time = ? WHERE project_id = ? AND header_id = ?`, [
          isoTimestamp,
          projectId,
          headerId,
        ]);
        console.log(`Updated first_exceeded_time=${isoTimestamp} for projectId=${projectId}, headerId=${headerId}`);
      } else {
        // Insert new row
        await db.run(
          `INSERT INTO ${tableName} (project_id, header_id, first_exceeded_time, is_monitored) VALUES (?, ?, ?, ?)`,
          [projectId, headerId, isoTimestamp, 1]
        );
        console.log(
          `Inserted row with first_exceeded_time=${isoTimestamp} for projectId=${projectId}, headerId=${headerId}`
        );
      }

      // Verify the update
      const verification = await db.get(
        `SELECT first_exceeded_time FROM ${tableName} WHERE project_id = ? AND header_id = ?`,
        [projectId, headerId]
      );
      console.log(`Verified: first_exceeded_time=${verification?.first_exceeded_time || "null"}`);
    } catch (error) {
      console.error(`Failed to set first_exceeded_time for projectId=${projectId}, headerId=${headerId}:`, error);
      throw error;
    }
  }
  static async resetExceededTimestamp(projectId, headerId) {
    // Clear the exceeded timestamp
    const db = await getDb();

    await db.run(
      `UPDATE project_header_settings 
       SET first_exceeded_time = NULL 
       WHERE project_id = ? AND header_id = ?`,
      [projectId, headerId]
    );
  }
  /**
   * Save an alert to the database
   */
  static async saveAlert(alert) {
    const db = await getDb();
    const alertData = {
      id: alert.id,
      type: alert.type,
      header_id: alert.headerId,
      header_name: alert.headerName,
      value: alert.value ?? null,
      threshold: alert.threshold ?? null,
      timestamp: alert.timestamp || new Date().toISOString(),
      project_id: alert.projectId,
      company_id: alert.companyId || null,
      stage_id: alert.stageId || null, // Fixed: Use actual stage_id from config
      dismissed: alert.dismissed || 0,
    };

    try {
      await db.run(
        `INSERT OR REPLACE INTO alerts (
          id, type, header_id, header_name, value, threshold, 
          timestamp, project_id, company_id, stage_id, dismissed
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          alertData.id,
          alertData.type,
          alertData.header_id,
          alertData.header_name,
          alertData.value,
          alertData.threshold,
          alertData.timestamp,
          alertData.project_id,
          alertData.company_id,
          alertData.stage_id,
          alertData.dismissed,
        ]
      );
      console.log("Alert saved:", alert.id);
      return true;
    } catch (error) {
      console.error("Alert save failed:", error);
      return false;
    }
  }

  static async checkThresholdAlert(projectId, config, currentValue, state) {
    try {
      const { threshold, alert_duration = 30, first_exceeded_time } = config;
      const now = Date.now();
      console.log(config);
      console.log(
        `Config: threshold=${threshold}, alert_duration=${alert_duration}, first_exceeded_time=${first_exceeded_time}`
      );
  
      // Check threshold condition
      const isBelowThreshold = currentValue < threshold;
      console.log(`Threshold check: ${currentValue} < ${threshold} = ${isBelowThreshold}`);
  
      const alertId = `threshold_${projectId}_${config.header_id}`;
  
      if (!isBelowThreshold) {
        console.log(
          `Threshold not breached, resetting timestamp and deleting alert for projectId=${projectId}, header_id=${config.header_id}`
        );
        await this.resetExceededTimestamp(projectId, config.header_id);
        await this.deleteAlert(alertId);
        return null;
      }
  
      // Calculate breach duration
      const firstExceeded = first_exceeded_time ? new Date(first_exceeded_time).getTime() : now;
      console.log(`firstExceeded=${firstExceeded} (${new Date(firstExceeded).toISOString()})`);
      const elapsedSeconds = (now - firstExceeded) / 1000;
  
      // First time below threshold? Record the timestamp
      if (!first_exceeded_time) {
        console.log(
          `No first_exceeded_time, setting initial timestamp for projectId=${projectId}, header_id=${config.header_id}`
        );
        await this.setInitialExceededTime(projectId, config.header_id, now);
        console.log(
          `Threshold breach started at ${new Date(now).toISOString()}, elapsed ${elapsedSeconds.toFixed(1)}s`
        );
        return null;
      }
  
      console.log(`Breach duration: ${elapsedSeconds.toFixed(1)}s / ${alert_duration}s`);
  
      // Check if breach duration meets requirement
      if (elapsedSeconds >= alert_duration) {
        const alert = {
          id: alertId,
          type: "threshold",
          headerId: config.header_id,
          headerName: config.header_name,
          value: currentValue,
          threshold,
          timestamp: new Date().toISOString(),
          projectId,
          state,
        };
  
        console.log(
          `ALERT TRIGGERED after ${elapsedSeconds.toFixed(1)} seconds for projectId=${projectId}, header_id=${
            config.header_id
          }`
        );
        await this.resetExceededTimestamp(projectId, config.header_id);
        await this.saveAlert(alert);
  
        return alert;
      }
  
      return null;
    } catch (error) {
      console.error(`Threshold check failed for projectId=${projectId}, header_id=${config.header_id}:`, error);
      return null;
    }
  }
  static async deleteAlert(alertId) {
    const db = await getDb();
    try {
      await db.run(`DELETE FROM alerts WHERE id = ?`, [alertId]);
      console.log(`Deleted alert: ${alertId}`);
    } catch (error) {
      console.error(`Failed to delete alert: ${alertId}`, error);
    }
  }
  static createThresholdAlert(config, value, state, duration) {
    return {
      id: this.generateAlertId("threshold", config.header_id),
      type: "threshold",
      headerId: config.header_id,
      headerName: config.header_name,
      value: value,
      threshold: config.threshold,
      duration: duration,
      timestamp: new Date().toISOString(),
      projectId: config.project_id,
      companyId: config.company_id,
      stageId: config.stage_id,
      state: state,
    };
  }

  static async checkFrozenAlert(projectId, config, currentValue, state) {
    // ... (similar structure for frozen alerts) ...
  }

  static createResponse(value, state, config, alert = null) {
    return {
      value: value,
      state: state,
      alert: alert,
      threshold: config.threshold,
      frozenThreshold: config.frozen_threshold,
      alertDuration: config.alert_duration,
    };
  }

  /**
   * Process multiple headers for a project
   */
  static async processProjectHeaders(projectId, headerValues) {
    const results = [];

    for (const { headerId, value, state } of headerValues) {
      const result = await this.checkHeaderValue(projectId, headerId, value, state);
      if (result) {
        results.push({ headerId, ...result });
      }
    }

    return results;
  }

  /**
   * Monitor all headers for all active projects
   * @param {Object} options - Options for monitoring process
   * @param {boolean} options.cleanupDuplicates - Whether to clean up duplicate headers (default: true)
   * @returns {Promise<Object>} - Monitoring results
   */
  static async monitorAllHeaders(options = { cleanupDuplicates: true }) {
    console.log("Starting header monitoring cycle for all projects");

    // Initialize results
    const results = {
      headerValues: {},
      alerts: [],
      totalProjects: 0,
      activeProjects: 0,
      processedHeaders: 0,
      duplicatesFound: 0,
      duplicatesCleaned: 0,
      errors: [],
    };

    try {
      // Get all active projects from database instead of API
      const db = await getDb();
      const projects = await db.all(`
        SELECT * FROM active_projects 
        WHERE is_deleted = 0
      `);

      if (!projects || !Array.isArray(projects)) {
        console.error("Failed to fetch projects from database");
        results.errors.push("Failed to fetch projects from database");
        return results;
      }

      results.totalProjects = projects.length;
      results.activeProjects = projects.length;

      if (projects.length === 0) {
        console.log("No active projects found");
        return results;
      }

      console.log(`Found ${projects.length} active projects`);

      // Get all monitored headers
      const monitoredHeaders = await this.getAllMonitoredHeaders();
      if (!monitoredHeaders || monitoredHeaders.length === 0) {
        console.log("No monitored headers found");
        return results;
      }

      console.log(`Found ${monitoredHeaders.length} monitored headers`);

      // Process each monitored header
      for (const header of monitoredHeaders) {
        try {
          const headerValue = await this.fetchHeaderValue(header.header_id);

          // Store result in headerValues
          results.headerValues[header.header_id] = {
            id: header.header_id, // Add id property for frontend compatibility
            headerId: header.header_id,
            value: headerValue.value,
            timestamp: headerValue.timestamp,
            lastUpdated: headerValue.timestamp, // Add lastUpdated for frontend compatibility
            companyId: header.company_id,
            stageId: header.stage_id,
            projectId: header.project_id,
            name: header.header_name,
            state: headerValue.state || "ENDED", // Make sure state is always included
          };

          // Check for alerts
          if (headerValue.value !== null) {
            const alertCheck = await this.checkHeaderValue(
              header.project_id,
              header.header_id,
              headerValue.value,
              headerValue.state
            );
            console.log(alertCheck, "alertCheck");
            if (alertCheck && alertCheck.alertState) {
              // Add alert to results
              results.alerts.push({
                type: alertCheck.alertState,
                headerId: header.header_id,
                headerName: header.header_name,
                value: headerValue.value,
                threshold: alertCheck.threshold,
                timestamp: new Date().toISOString(),
                companyId: header.company_id,
                stageId: header.stage_id,
                projectId: header.project_id,
              });
            }
          }

          results.processedHeaders++;
        } catch (error) {
          console.error(`Error processing header ${header.header_id}:`, error);
          results.errors.push(`Error processing header ${header.header_id}: ${error.message}`);
        }
      }

      // Cleanup duplicate headers if enabled
      if (options.cleanupDuplicates) {
        try {
          const cleanupCount = await this.cleanupDuplicateHeaders();
          results.duplicatesCleaned = cleanupCount;
        } catch (cleanupError) {
          console.error("Error cleaning up duplicate headers:", cleanupError);
          results.errors.push(`Cleanup error: ${cleanupError.message}`);
        }
      }

      console.log(
        `Header monitoring cycle completed. Processed ${results.processedHeaders} headers, found ${results.alerts.length} alerts`
      );

      // Convert the headerValues object to an array for frontend compatibility
      const headerValuesArray = Object.values(results.headerValues);
      return { headerValues: headerValuesArray, alerts: results.alerts };
    } catch (error) {
      console.error("Error in monitorAllHeaders:", error);
      results.errors.push(`Monitoring failed: ${error.message}`);
      return { headerValues: [], alerts: [] };
    }
  }

  /**
   * Process headers for a specific project
   * @param {string} projectId - Project ID
   * @returns {Promise<Object>} - Processing results
   */
  static async processProjectHeaders(projectId) {
    const results = {
      processedHeaders: 0,
      duplicatesFound: 0,
      errors: [],
    };

    try {
      // Get headers for project
      const headers = await this.fracbrainApi.getProjectHeaders(projectId);

      if (!headers || !Array.isArray(headers)) {
        console.error(`Failed to fetch headers or received invalid data for project ${projectId}`);
        results.errors.push(`Failed to fetch headers for project ${projectId}`);
        return results;
      }

      console.log(`Retrieved ${headers.length} headers for project ${projectId}`);

      // Track header IDs to detect duplicates
      const headerIds = new Set();
      const duplicates = new Set();

      for (const header of headers) {
        try {
          if (headerIds.has(header.id)) {
            // Found a duplicate
            duplicates.add(header.id);
            results.duplicatesFound++;
            console.log(`Found duplicate header: ${header.id} in project ${projectId}`);
            continue;
          }

          headerIds.add(header.id);

          // Store header in database
          await this.db.storeProjectHeader(projectId, header.id);
          results.processedHeaders++;
        } catch (error) {
          console.error(`Error processing header ${header.id}:`, error);
          results.errors.push(`Error processing header ${header.id}: ${error.message}`);
        }
      }

      return results;
    } catch (error) {
      console.error(`Error in processProjectHeaders for project ${projectId}:`, error);
      results.errors.push(`Processing failed: ${error.message}`);
      return results;
    }
  }

  /**
   * Clean up duplicate headers for a specific project
   * @param {string} projectId - Project ID
   * @returns {Promise<Object>} - Cleanup results
   */
  static async cleanupDuplicateHeaders(projectId) {
    console.log(`Cleaning up duplicate headers for project ${projectId}`);

    const results = {
      checked: 0,
      duplicatesFound: 0,
      cleaned: 0,
      errors: [],
    };

    try {
      // Get database connection
      const db = await dbService.getDb();

      // Begin transaction
      await db.exec("BEGIN TRANSACTION");

      try {
        // Find all headers for this project
        const query = `
          SELECT header_id, COUNT(*) as count
          FROM project_headers 
          WHERE project_id = ?
          GROUP BY header_id
          HAVING COUNT(*) > 1
        `;

        const duplicates = await db.all(query, [projectId]);
        results.duplicatesFound = duplicates.length;

        console.log(`Found ${duplicates.length} headers with duplicates in project ${projectId}`);

        // Process each duplicate
        for (const duplicate of duplicates) {
          try {
            const headerId = duplicate.header_id;
            results.checked++;

            // Get all instances of this header, ordered by last_updated (most recent first)
            const headerInstances = await db.all(
              `
              SELECT id, project_id, header_id, last_updated
              FROM project_headers
              WHERE project_id = ? AND header_id = ?
              ORDER BY last_updated DESC
            `,
              [projectId, headerId]
            );

            // Keep the most recent entry, delete the rest
            if (headerInstances.length > 1) {
              // Skip the first entry (most recent) and delete the rest
              for (let i = 1; i < headerInstances.length; i++) {
                await db.run("DELETE FROM project_headers WHERE id = ?", [headerInstances[i].id]);

                // Also clean up any related settings for this duplicate
                await db.run(
                  `
                  DELETE FROM project_header_settings 
                  WHERE project_id = ? AND header_id = ? AND id IN (
                    SELECT id FROM project_header_settings 
                    WHERE project_id = ? AND header_id = ?
                    ORDER BY last_updated DESC
                    LIMIT -1 OFFSET 1
                  )
                `,
                  [projectId, headerId, projectId, headerId]
                );

                results.cleaned++;
              }

              console.log(`Cleaned up ${headerInstances.length - 1} duplicates for header ${headerId}`);
            }
          } catch (error) {
            console.error(`Error cleaning up duplicate header ${duplicate.header_id}:`, error);
            results.errors.push(`Error cleaning duplicate ${duplicate.header_id}: ${error.message}`);
          }
        }

        // Commit transaction
        await db.exec("COMMIT");

        console.log(`Successfully cleaned up ${results.cleaned} duplicate headers for project ${projectId}`);
        return results;
      } catch (error) {
        // Rollback transaction on error
        await db.exec("ROLLBACK");
        console.error(`Error in cleanupDuplicateHeaders for project ${projectId}:`, error);
        results.errors.push(`Cleanup failed: ${error.message}`);
        return results;
      }
    } catch (error) {
      console.error(`Failed to get database connection for cleaning duplicates:`, error);
      results.errors.push(`Database connection failed: ${error.message}`);
      return results;
    }
  }

  /**
   * Get all monitored headers with simplified format
   * Used by the API for frontend integration
   */
  static async getMonitoredHeaders() {
    try {
      const headers = await HeaderMonitorService.getAllMonitoredHeaders();

      // Transform the database format to a simpler format for the frontend
      return headers.map((header) => ({
        id: header.header_id,
        name: header.header_name,
        projectId: header.project_id,
        projectName: header.project_name,
        companyId: header.company_id,
        companyName: header.company_name,
        stageId: header.stage_id,
        unit: header.unit || "",
        isMonitored: header.is_monitored === 1,
        settings: {
          threshold: header.threshold,
          alertDuration: header.alert_duration,
          frozenThreshold: header.frozen_threshold,
        },
      }));
    } catch (error) {
      console.error("Error getting formatted monitored headers:", error);
      return [];
    }
  }

  // Frozen state tracking system
  static frozenStates = {};

  /**
   * Track a header that might be frozen (no data)
   */
  static trackFrozenState(headerId) {
    if (!HeaderMonitorService.frozenStates[headerId]) {
      const timestamp = Date.now();
      const stateId = `frozen_${headerId}_${timestamp}`;
      console.log(`[${new Date().toISOString()}] Added frozen state: ${stateId} for header ${headerId}`);
      HeaderMonitorService.frozenStates[headerId] = timestamp;
    }
  }

  /**
   * Clear frozen state tracking for a header
   */
  static clearFrozenState(headerId) {
    if (HeaderMonitorService.frozenStates[headerId]) {
      delete HeaderMonitorService.frozenStates[headerId];
    }
  }

  /**
   * Get frozen duration in seconds for a header
   */
  static getFrozenDuration(headerId) {
    const frozenTimestamp = HeaderMonitorService.frozenStates[headerId];
    if (!frozenTimestamp) return 0;

    return Math.round((Date.now() - frozenTimestamp) / 1000);
  }

  /**
   * Check if an alert is snoozed
   */
  static async isAlertSnoozed(alertId) {
    try {
      const db = await getDb();
      const now = new Date().toISOString();

      // Check if there's an active snooze for this alert
      const snooze = await db.get(
        "SELECT * FROM alert_snoozes WHERE alert_id = ? AND snooze_until > ? ORDER BY created_at DESC LIMIT 1",
        [alertId, now]
      );

      return !!snooze;
    } catch (error) {
      console.error(`Error checking snooze status for alert ${alertId}:`, error);
      return false;
    }
  }

  /**
   * Get all active alerts with snooze info
   */
  static async getActiveAlerts() {
    try {
      const db = await getDb();
      const now = new Date().toISOString();

      // Get all non-dismissed alerts
      const alerts = await db.all(
        `SELECT a.*, s.snooze_until 
         FROM alerts a 
         LEFT JOIN alert_snoozes s ON a.id = s.alert_id AND s.snooze_until > ?
         WHERE a.dismissed = 0
         ORDER BY a.timestamp DESC`,
        [now]
      );

      return alerts.map((alert) => ({
        ...alert,
        snoozed: !!alert.snooze_until,
      }));
    } catch (error) {
      console.error("Error fetching active alerts:", error);
      return [];
    }
  }

  /**
   * Generate alert ID
   */
  static generateAlertId(type, headerId, timestamp) {
    return `${type.toLowerCase()}_${headerId}_${timestamp}`;
  }

  // Helper method to detect header type
  static async detectHeaderType(headerName) {
    if (!headerName) return null;

    try {
      // Load settings to get pattern categories
      const settings = await loadSettings();
      if (!settings || !settings.patternCategories) return null;

      const { patternCategories } = settings;
      const headerNameLower = headerName.toLowerCase();

      // Check if it's a pressure header
      if (patternCategories.pressure) {
        const { patterns, negativePatterns } = patternCategories.pressure;

        // Check if the header matches any positive patterns
        const matchesPositive = patterns && patterns.some((pattern) => headerNameLower.includes(pattern.toLowerCase()));

        // Check if the header matches any negative patterns
        const matchesNegative =
          negativePatterns && negativePatterns.some((pattern) => headerNameLower.includes(pattern.toLowerCase()));

        // It's a pressure header if it matches positive patterns but not negative ones
        if (matchesPositive && !matchesNegative) {
          return "pressure";
        }
      }

      // Check if it's a battery header
      if (patternCategories.battery) {
        const { patterns, negativePatterns } = patternCategories.battery;

        // Check if the header matches any positive patterns
        const matchesPositive = patterns && patterns.some((pattern) => headerNameLower.includes(pattern.toLowerCase()));

        // Check if the header matches any negative patterns
        const matchesNegative =
          negativePatterns && negativePatterns.some((pattern) => headerNameLower.includes(pattern.toLowerCase()));

        // It's a battery header if it matches positive patterns but not negative ones
        if (matchesPositive && !matchesNegative) {
          return "battery";
        }
      }

      // Couldn't determine the type
      return "unknown";
    } catch (error) {
      console.error("Error detecting header type:", error);
      return "unknown";
    }
  }

  /**
   * Update monitored headers when a stage changes within the same project
   * This maps old stage headers to new stage headers and maintains settings
   */
  static async updateMonitoredHeadersForNewStage(oldStageId, newStageId) {
    try {
      console.log(`Stage transition detected: ${oldStageId} -> ${newStageId}`);

      // Get token for API calls
      const token = getFracBrainToken();
      if (!token) {
        console.error("No FracBrain API token found in environment variables");
        throw new Error("API authentication token not available");
      }

      const db = await getDb();

      // 1. Get project ID for the stages
      const oldStageProject = await db.get("SELECT project_id FROM active_projects WHERE stage_id = ?", [oldStageId]);
      const newStageProject = await db.get("SELECT project_id FROM active_projects WHERE stage_id = ?", [newStageId]);

      if (!oldStageProject || !newStageProject) {
        console.warn(`Could not find project information for stages ${oldStageId} and/or ${newStageId}`);
        return false;
      }

      // Verify the stages belong to the same project
      if (oldStageProject.project_id !== newStageProject.project_id) {
        console.warn(`Stages ${oldStageId} and ${newStageId} belong to different projects, skipping header migration`);
        return false;
      }

      const projectId = oldStageProject.project_id;
      console.log(`Both stages belong to project ${projectId}, proceeding with header migration`);

      // 2. Get currently monitored headers for the old stage
      const oldHeaders = await db.all(
        `
        SELECT phs.*
        FROM project_header_settings phs
        WHERE phs.project_id = ? AND phs.is_monitored = 1
      `,
        [projectId]
      );

      if (oldHeaders.length === 0) {
        console.log(`No monitored headers found for old stage ${oldStageId}`);
        return true;
      }

      console.log(`Found ${oldHeaders.length} monitored headers for the old stage ${oldStageId}`);

      // 3. Fetch headers for the new stage from FracBrain API
      const apiHeaders = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      };

      console.log(`Fetching headers for new stage ${newStageId} from FracBrain API...`);
      const stageHeadersResponse = await fetch(`${FRACBRAIN_API_BASE}/stages/${newStageId}/headers`, {
        headers: apiHeaders,
        credentials: "omit",
      });

      if (!stageHeadersResponse.ok) {
        const errorText = await stageHeadersResponse.text().catch(() => "");
        throw new Error(`Failed to fetch headers for new stage: ${stageHeadersResponse.status} - ${errorText}`);
      }

      const headersData = await stageHeadersResponse.json();
      const newStageHeaders = headersData.headers || [];

      console.log(`Fetched ${newStageHeaders.length} headers for new stage ${newStageId}`);

      // Create multiple maps for different matching strategies
      const oldHeaderExactMap = {}; // Exact match
      const oldHeaderNormalizedMap = {}; // Normalized match (lowercase, trimmed)
      const oldHeaderSimplifiedMap = {}; // Simplified match (remove special chars)
      const oldHeaderKeywordMap = {}; // Keyword-based match

      // Helper function to simplify header names
      const simplifyHeaderName = (name) => {
        return name
          .toLowerCase()
          .replace(/[\s_-]+/g, "") // Remove spaces, underscores, hyphens
          .replace(/[^\w\d]/g, ""); // Remove special characters
      };

      // Helper function to extract keywords from header names
      const extractKeywords = (name) => {
        const keywords = [];
        const parts = name.toLowerCase().split(/[\s_-]+/);
        for (const part of parts) {
          if (part.length > 3) {
            // Only use keywords longer than 3 chars
            keywords.push(part);
          }
        }
        return keywords;
      };

      // Populate all matching maps - ONLY for headers that are already being monitored
      oldHeaders.forEach((header) => {
        // Only include headers that are already monitored
        if (header.is_monitored !== 1) return;

        const headerName = header.header_name;

        // Exact match
        oldHeaderExactMap[headerName] = header;

        // Normalized match (lowercase, trimmed)
        const normalizedName = headerName.toLowerCase().trim();
        oldHeaderNormalizedMap[normalizedName] = header;

        // Simplified match (remove special chars)
        const simplifiedName = simplifyHeaderName(headerName);
        oldHeaderSimplifiedMap[simplifiedName] = header;

        // Keyword-based match
        const keywords = extractKeywords(headerName);
        keywords.forEach((keyword) => {
          if (!oldHeaderKeywordMap[keyword]) {
            oldHeaderKeywordMap[keyword] = [];
          }
          oldHeaderKeywordMap[keyword].push(header);
        });
      });

      // Track which old headers were successfully migrated
      const migratedHeaders = new Map();

      // 4. For each header in the new stage, check if we need to migrate monitoring from an old header
      for (const newHeader of newStageHeaders) {
        const newHeaderName = newHeader.name;
        let matchingOldHeader = null;
        let matchStrategy = null;

        // Try exact match first
        if (oldHeaderExactMap[newHeaderName]) {
          matchingOldHeader = oldHeaderExactMap[newHeaderName];
          matchStrategy = "exact";
        }
        // Try normalized match
        else {
          const normalizedNewName = newHeaderName.toLowerCase().trim();
          if (oldHeaderNormalizedMap[normalizedNewName]) {
            matchingOldHeader = oldHeaderNormalizedMap[normalizedNewName];
            matchStrategy = "normalized";
          }
          // Try simplified match
          else {
            const simplifiedNewName = simplifyHeaderName(newHeaderName);
            if (oldHeaderSimplifiedMap[simplifiedNewName]) {
              matchingOldHeader = oldHeaderSimplifiedMap[simplifiedNewName];
              matchStrategy = "simplified";
            }
            // Try keyword match as last resort
            else {
              const keywords = extractKeywords(newHeaderName);
              let bestMatch = null;
              let maxMatchingKeywords = 0;

              for (const keyword of keywords) {
                const matchingHeaders = oldHeaderKeywordMap[keyword] || [];
                for (const oldHeader of matchingHeaders) {
                  const oldKeywords = extractKeywords(oldHeader.header_name);
                  const matchingKeywordCount = keywords.filter((k) => oldKeywords.includes(k)).length;

                  if (matchingKeywordCount > maxMatchingKeywords) {
                    maxMatchingKeywords = matchingKeywordCount;
                    bestMatch = oldHeader;
                  }
                }
              }

              if (bestMatch && maxMatchingKeywords >= 2) {
                // Require at least 2 matching keywords
                matchingOldHeader = bestMatch;
                matchStrategy = `keyword (${maxMatchingKeywords} keywords)`;
              }
            }
          }
        }

        // Only process headers that were already being monitored
        if (matchingOldHeader && matchingOldHeader.is_monitored === 1) {
          console.log(
            `Found matching header: "${matchingOldHeader.header_name}" -> "${newHeader.name}" using ${matchStrategy} match`
          );

          // 5. Migrate monitoring settings from old header to new header
          console.log(
            `Migrating settings from old header ${matchingOldHeader.header_id} to new header ${newHeader.id}`
          );

          // Track that this old header was migrated
          migratedHeaders.set(matchingOldHeader.header_id, newHeader.id);

          // 6. Disable monitoring for the old header to prevent frozen alerts
          await HeaderSettingsService.removeHeaderMonitoring(projectId, matchingOldHeader.header_id);
          console.log(`Disabled monitoring for old header ${matchingOldHeader.header_id}`);

          // 7. Set up the new header with the same settings
          const success = await HeaderSettingsService.upsertHeaderSettings(projectId, {
            id: newHeader.id,
            name: newHeader.name,
            threshold: matchingOldHeader.threshold,
            alertDuration: matchingOldHeader.alert_duration,
            frozenThreshold: matchingOldHeader.frozen_threshold,
            isMonitored: true, // Keep monitoring status for matching headers
          });

          if (success) {
            console.log(
              `Successfully migrated monitoring settings from header ${matchingOldHeader.header_id} to ${newHeader.id}`
            );

            // Clear any frozen states for the old header
            HeaderMonitorService.clearFrozenState(matchingOldHeader.header_id);
          } else {
            console.error(`Failed to migrate monitoring settings to new header ${newHeader.id}`);
          }
        } else if (matchingOldHeader) {
          console.log(
            `Found matching header "${matchingOldHeader.header_name}" -> "${newHeader.name}" but it wasn't being monitored, skipping migration`
          );
        }
      }

      // 8. Check for old monitored headers that weren't migrated and disable them
      for (const oldHeader of oldHeaders) {
        if (oldHeader.is_monitored === 1 && !migratedHeaders.has(oldHeader.header_id)) {
          console.log(
            `No matching header found for "${oldHeader.header_name}" (${oldHeader.header_id}), disabling monitoring`
          );
          await HeaderSettingsService.removeHeaderMonitoring(projectId, oldHeader.header_id);
          HeaderMonitorService.clearFrozenState(oldHeader.header_id);
        }
      }

      console.log(`Completed stage transition from ${oldStageId} to ${newStageId}`);
      return true;
    } catch (error) {
      console.error("Error updating monitored headers for new stage:", error);
      return false;
    }
  }

  /**
   * Find and remove duplicate monitored headers (same name, different ID) for all projects
   * Keeps only the newest header (highest ID) for each unique header name
   */
  static async cleanupDuplicateHeaders() {
    try {
      console.log("Starting duplicate header cleanup...");
      const db = await getDb();

      // Get all projects with monitored headers
      const projects = await db.all(`
        SELECT DISTINCT project_id
        FROM project_header_settings
        WHERE is_monitored = 1
      `);

      let cleanupCount = 0;

      // Process each project
      for (const project of projects) {
        const projectId = project.project_id;

        // Get all monitored headers for this project
        const headers = await db.all(
          `
          SELECT *
          FROM project_header_settings
          WHERE project_id = ? AND is_monitored = 1
        `,
          [projectId]
        );

        // Group headers by normalized name
        const headersByName = {};
        headers.forEach((header) => {
          const normalizedName = header.header_name.toLowerCase().trim();
          if (!headersByName[normalizedName]) {
            headersByName[normalizedName] = [];
          }
          headersByName[normalizedName].push(header);
        });

        // For each group, keep only the newest header
        for (const [headerName, headerGroup] of Object.entries(headersByName)) {
          if (headerGroup.length > 1) {
            // Sort by ID (assuming higher ID means newer header)
            headerGroup.sort((a, b) => parseInt(b.header_id) - parseInt(a.header_id));

            // Keep the first one (highest ID), disable the rest
            for (let i = 1; i < headerGroup.length; i++) {
              console.log(
                `Removing duplicate header ${headerGroup[i].header_id} (${headerGroup[i].header_name}) from project ${projectId}`
              );
              await HeaderSettingsService.removeHeaderMonitoring(projectId, headerGroup[i].header_id);
              cleanupCount++;
            }
          }
        }
      }

      console.log(`Duplicate header cleanup complete. Removed ${cleanupCount} duplicate headers.`);
      return cleanupCount;
    } catch (error) {
      console.error("Error cleaning up duplicate headers:", error);
      return 0;
    }
  }
}
