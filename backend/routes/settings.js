import express from "express";
import { getDb } from "../database/db.js";

const router = express.Router();

// Test endpoint for debugging
router.get("/test", async (req, res) => {
  console.log("Settings test endpoint hit!");
  return res.json({ success: true, message: "Settings API is working" });
});

// Get all settings
router.get("/", async (req, res) => {
  try {
    const db = await getDb();
    const result = await db.get("SELECT settings_json FROM settings WHERE id = 1");

    // If no settings found, return default settings
    if (!result) {
      const defaultSettings = {
        pollingInterval: 60, // seconds
        patternCategories: {
          pressure: {
            patterns: ["pressure", "psi"],
            negativePatterns: ["atmospheric", "atm"],
            threshold: 100,
            alertDuration: 120,
            frozenThreshold: 60,
            notificationInterval: 300, // 5 minutes between notifications per header
          },
          battery: {
            patterns: ["battery", "batt", "volt"],
            threshold: 20,
            alertDuration: 300,
            frozenThreshold: 300,
            notificationInterval: 300, // 5 minutes between notifications per header
          },
        },
        webhooks: {
          enabled: false,
          slackEnabled: false,
          teamsEnabled: false,
          slackWebhookUrl: "",
          teamsWebhookUrl: "",
          customWebhooks: [],
          sendThresholdAlerts: true,
          sendFrozenAlerts: true,
          sendErrorAlerts: true,
        },
      };

      // Store default settings
      await db.run("INSERT INTO settings (id, settings_json) VALUES (?, ?)", [1, JSON.stringify(defaultSettings)]);

      return res.json(defaultSettings);
    }

    return res.json(JSON.parse(result.settings_json));
  } catch (error) {
    console.error("Error fetching settings:", error);
    return res.status(500).json({ error: "Failed to fetch settings" });
  }
});

// Update settings
router.post("/", async (req, res) => {
  try {
    const settings = req.body;

    if (!settings || typeof settings !== "object") {
      return res.status(400).json({ error: "Settings object is required" });
    }

    const db = await getDb();

    // Get current settings
    const currentResult = await db.get("SELECT settings_json FROM settings WHERE id = 1");
    let currentSettings = currentResult ? JSON.parse(currentResult.settings_json) : null;

    // If no current settings, use defaults
    if (!currentSettings) {
      currentSettings = {
        pollingInterval: 60,
        patternCategories: {
          pressure: {
            patterns: ["pressure", "psi"],
            negativePatterns: ["atmospheric", "atm"],
            threshold: 100,
            alertDuration: 120,
            frozenThreshold: 60,
            notificationInterval: 300,
          },
          battery: {
            patterns: ["battery", "batt", "volt"],
            threshold: 20,
            alertDuration: 300,
            frozenThreshold: 300,
            notificationInterval: 300,
          },
        },
        webhooks: {
          enabled: false,
          slackEnabled: false,
          teamsEnabled: false,
          slackWebhookUrl: "",
          teamsWebhookUrl: "",
          customWebhooks: [],
          sendThresholdAlerts: true,
          sendFrozenAlerts: true,
          sendErrorAlerts: true,
        },
      };
    }

    // Ensure the webhooks object has customWebhooks array
    if (!currentSettings.webhooks) {
      currentSettings.webhooks = {
        enabled: false,
        customWebhooks: [],
      };
    } else if (!Array.isArray(currentSettings.webhooks.customWebhooks)) {
      currentSettings.webhooks.customWebhooks = [];
    }

    // Merge new settings with current settings
    const updatedSettings = {
      ...currentSettings,
      ...settings,
      patternCategories: {
        ...currentSettings.patternCategories,
        ...(settings.patternCategories || {}),
      },
      webhooks: {
        ...currentSettings.webhooks,
        ...(settings.webhooks || {}),
      },
    };

    // Validate numeric values
    if (typeof updatedSettings.pollingInterval === "number" && updatedSettings.pollingInterval < 10) {
      return res.status(400).json({ error: "Polling interval must be at least 10 seconds" });
    }

    // Save updated settings
    await db.run("INSERT OR REPLACE INTO settings (id, settings_json) VALUES (?, ?)", [
      1,
      JSON.stringify(updatedSettings),
    ]);

    return res.json(updatedSettings);
  } catch (error) {
    console.error("Error updating settings:", error);
    return res.status(500).json({ error: "Failed to update settings" });
  }
});

// Support for pattern categories
router.post("/patterns", async (req, res) => {
  try {
    const { patternCategories } = req.body;
    console.log("patternCategories", patternCategories);
    if (!patternCategories || typeof patternCategories !== "object") {
      return res.status(400).json({ error: "Pattern categories object is required" });
    }

    const db = await getDb();

    // Get current settings
    const currentResult = await db.get("SELECT settings_json FROM settings WHERE id = 1");
    let currentSettings = currentResult
      ? JSON.parse(currentResult.settings_json)
      : {
          pollingInterval: 60,
          patternCategories: {},
        };

    // Update pattern categories
    currentSettings.patternCategories = patternCategories;

    // Add notification interval if missing
    if (
      currentSettings.patternCategories.pressure &&
      !currentSettings.patternCategories.pressure.notificationInterval
    ) {
      currentSettings.patternCategories.pressure.notificationInterval = 300;
    }

    if (currentSettings.patternCategories.battery && !currentSettings.patternCategories.battery.notificationInterval) {
      currentSettings.patternCategories.battery.notificationInterval = 300;
    }

    // Save updated settings
    await db.run("INSERT OR REPLACE INTO settings (id, settings_json) VALUES (?, ?)", [
      1,
      JSON.stringify(currentSettings),
    ]);

    return res.json({ patternCategories });
  } catch (error) {
    console.error("Error updating pattern categories:", error);
    return res.status(500).json({ error: "Failed to update pattern categories" });
  }
});

export { router };
