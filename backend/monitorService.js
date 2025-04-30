// monitorService.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url'; // Import necessary function
import fetch from 'node-fetch'; // Using node-fetch v2
import chokidar from 'chokidar'; // Import chokidar
import express from 'express';
import cors from 'cors';
import monitoringStatusRouter, { updateMonitoringCache } from "./api/monitoringStatus.js";
import settingsRouter from './api/settings.js';
import dotenv from 'dotenv';
import { initDatabase, getDb } from './database/db.js';
import { sendAlertNotifications } from './utils/notifications.js';
import { router as monitoringRoutes } from './routes/monitoring.js';
import { router as projectsRoutes } from './routes/projects.js';
import projectRouter from './api/project.js';
import { loadSettings, loadHeaderThresholds } from './utils/settingsStorage.js';
import { HeaderMonitorService } from './services/headerMonitorService.js';
import { createRequire } from 'module';
import { upsertActiveProjects } from './routes/monitoring.js';

// Load environment variables
dotenv.config();

// Initialize database
console.log('Initializing database...');
await initDatabase();
console.log('Database initialized');

// Get current directory in ES module scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration ---
// Ensure private/settings directory exists
const SETTINGS_DIR = path.resolve(__dirname, 'private/settings');
if (!fs.existsSync(SETTINGS_DIR)) {
    fs.mkdirSync(SETTINGS_DIR, { recursive: true });
    console.log(`Created settings directory: ${SETTINGS_DIR}`);
}

// Initialize default settings if they don't exist
const SETTINGS_PATH = path.resolve(SETTINGS_DIR, 'settings.json');
const THRESHOLDS_PATH = path.resolve(SETTINGS_DIR, 'header_thresholds.json');

// Create default settings if they don't exist
if (!fs.existsSync(SETTINGS_PATH)) {
    const defaultSettings = {
        patternCategories: {
            pressure: {
                patterns: ['pressure', 'psi'],
                negativePatterns: ['atmospheric', 'atm'],
                threshold: 100,
                alertDuration: 120,
                frozenThreshold: 60
            },
            battery: {
                patterns: ['battery', 'batt', 'volt'],
                threshold: 20,
                alertDuration: 300,
                frozenThreshold: 300
            }
        },
        pressureAlertDuration: 120,
        version: 1
    };
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(defaultSettings, null, 2));
    console.log(`Created default settings at: ${SETTINGS_PATH}`);
}

// Create default thresholds if they don't exist
if (!fs.existsSync(THRESHOLDS_PATH)) {
    const defaultThresholds = {
        thresholds: {},
        headerSettings: {},
        lastUpdated: new Date().toISOString(),
        version: 1
    };
    fs.writeFileSync(THRESHOLDS_PATH, JSON.stringify(defaultThresholds, null, 2));
    console.log(`Created default thresholds at: ${THRESHOLDS_PATH}`);
}

// Load API base URL from environment variable
const FRACBRAIN_API_BASE = process.env.FRACBRAIN_API_BASE;

// Load token from environment variable - check both FRACBRAIN_TOKEN and VITE_ prefixed version
const FRACBRAIN_TOKEN = process.env.FRACBRAIN_TOKEN || process.env.VITE_FRACBRAIN_TOKEN;

if (!FRACBRAIN_API_BASE) {
    console.error("FATAL ERROR: FRACBRAIN_API_BASE is not defined in environment variables.");
    process.exit(1); 
}

if (!FRACBRAIN_TOKEN) {
    console.error("FATAL ERROR: FRACBRAIN_TOKEN is not defined in environment variables.");
    process.exit(1); 
}

// Test the token by making a simple API call
async function testFracBrainToken() {
    try {
        console.log('Testing FracBrain API connection...');
        console.log(`Using API base: ${FRACBRAIN_API_BASE}`);
        const headers = {
            'Authorization': `Bearer ${FRACBRAIN_TOKEN}`,
            'Content-Type': 'application/json',
            'accept': 'application/json'
        };

        // Test 1: Verify stages endpoint
        console.log('\nTesting stages endpoint (/stages/active/stages)...');
        const stagesResponse = await fetch(`${FRACBRAIN_API_BASE}/stages/active/stages`, { 
            headers,
            credentials: 'omit'
        });
        
        if (!stagesResponse.ok) {
            const errorText = await stagesResponse.text();
            throw new Error(`Stages endpoint test failed with status: ${stagesResponse.status} - ${errorText}`);
        }

        const stagesData = await stagesResponse.json();
        console.log('✓ Stages endpoint accessible');
        const activeStages = stagesData.stages || [];
        console.log(`Found ${activeStages.length} active stages`);

        // Test 2: Verify headers endpoint for the first active stage
        let firstHeaderId = null;
        let firstStageId = null;
        if (activeStages.length > 0) {
            firstStageId = activeStages[0].stageId;
            console.log(`\nTesting headers endpoint for first active stage (ID: ${firstStageId})...`);
            const stageHeadersResponse = await fetch(`${FRACBRAIN_API_BASE}/stages/${firstStageId}/headers`, { 
                headers,
                credentials: 'omit' // Don't send cookies
            });

            if (!stageHeadersResponse.ok) {
                 console.warn(`⚠️ Warning: Could not fetch headers for stage ${firstStageId}:`, await stageHeadersResponse.text());
            } else {
                const headersData = await stageHeadersResponse.json();
                console.log(`✓ Headers endpoint accessible for stage ${firstStageId}`);
                const stageHeaders = headersData.headers || [];
                console.log(`Found ${stageHeaders.length} headers for stage ${firstStageId}`);
                if (stageHeaders.length > 0) {
                    firstHeaderId = stageHeaders[0].id; // Use the actual header ID
                    console.log(`  Using first header for datum test (ID: ${firstHeaderId}, Name: ${stageHeaders[0].name})`);
                }
            }
        } else {
            console.log('\nℹ️ No active stages found to test headers endpoint');
        }

        // Test 3: Verify datum endpoint using the first header ID found
        if (firstHeaderId) {
            console.log(`\nTesting datum endpoint (/stages/datum/${firstHeaderId})...`);
            try {
                const datumResponse = await fetch(`${FRACBRAIN_API_BASE}/stages/datum/${firstHeaderId}`, { 
                    headers,
                    credentials: 'omit' // Don't send cookies
                });

                if (!datumResponse.ok) {
                    console.warn(`⚠️ Warning: Could not fetch datum for header ${firstHeaderId}:`, await datumResponse.text());
                } else {
                    const datumData = await datumResponse.json();
                    if (datumData.data) {
                        console.log(`✓ Successfully accessed datum for header ${firstHeaderId}`);
                        console.log('  Data available:', {
                            id: datumData.data.id,
                            name: datumData.data.name,
                            dataPoints: datumData.data.data?.length || 0
                        });
                    } else {
                        console.log(`ℹ️ No datum data available for header ${firstHeaderId}`);
                    }
                }
            } catch (error) {
                console.error(`❌ Error fetching datum for header ${firstHeaderId}:`, error.message);
            }
        } else if (activeStages.length > 0) {
             console.log('\nℹ️ No headers found for the first active stage to test datum endpoint');
        }
        
        console.log('\n✓ API connection testing finished.');
        return true; // Return true even if datum test fails for a specific header
    } catch (error) {
        console.error('\n❌ API endpoint testing failed critically:', error.message);
        return false;
    }
}

let currentSettings = {};
let currentThresholdsData = {}; // Store the whole object { thresholds: {...}, lastUpdated, version }
let monitoredItems = {}; // Structure: { headerId: { threshold: number | null } }
let activeAlerts = {}; // Structure: { alertId: { details... } }
let lastHeaderValues = {}; // Structure: { headerId: { value: any, timestamp: number } }

// Add a class property to track when the last notification was sent
let lastNotificationTime = null;

// Get port from environment variable
const PORT = process.env.MONITOR_API_PORT || 3002;

// Initialize Express app
const app = express();

// Enable CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Parse JSON bodies
app.use(express.json());

// Use the routers
app.use('/api/monitoring', monitoringStatusRouter);
app.use('/api/settings', settingsRouter);

// Initialize lookup maps for alert states and frozen states
let alertStates = new Map(); // Map of headerId -> { timestamp, count } for tracking alert durations
let frozenStates = new Map(); // Map of headerId -> timestamp for tracking when a value hasn't changed

// Global configuration object
let config = {
  pollingInterval: 5, // Default polling interval in seconds
  headerThresholds: {},
  headerSettings: {},
  patternCategories: {
    pressure: {
      patterns: ["pressure", "casing", "tubing", "cbt"],
      negativePatterns: [
        "fdi", "derivative", "projected", "curve", "predicted", "qc",
        "pumpdown", "treating", "inverse", "hydrostatic", "measuredpressure",
        "natural", "gas", "seal", "p-seal"
      ],
      threshold: 20,
      alertDuration: 20,
      frozenThreshold: 120
    },
    battery: {
      patterns: ["bat", "battery"],
      threshold: 20,
      alertDuration: 120,
      frozenThreshold: 300
    }
  },
  webhooks: {
    enabled: false,
    slackEnabled: true,
    emailEnabled: false,
    teamsEnabled: false,
    slackWebhookUrl: "",
    emailRecipients: "",
    teamsWebhookUrl: "",
    sendThresholdAlerts: true,
    sendFrozenAlerts: true,
    sendErrorAlerts: true,
    interval: 3600000
  },
  lastUpdated: null
};

// Health status tracking object
const healthStatus = {
  lastMonitoringCycle: null,
  lastSuccessfulCycle: null,
  consecutiveErrors: 0,
  isHealthy: true,
  databaseConnectionOk: true,
  apiConnectionOk: true,
  configLoadOk: true,
  lastErrorMessage: null,
  lastHealthCheck: null,
  version: '1.0.0',
  startTime: new Date().toISOString()
};

// Helper function to determine header type based on patterns
function getHeaderType(headerName) {
  const currentConfig = getConfig();
  const { patternCategories } = currentConfig;
  
  if (!headerName) return null;
  
  // Check pressure category first
  if (patternCategories.pressure) {
    // Check negative patterns first
    if (patternCategories.pressure.negativePatterns?.some(pattern => 
      headerName.toLowerCase().includes(pattern.toLowerCase())
    )) {
      return null;
    }
    
    // Then check positive patterns
    if (patternCategories.pressure.patterns?.some(pattern => 
      headerName.toLowerCase().includes(pattern.toLowerCase())
    )) {
      return 'pressure';
    }
  }
  
  // Check battery category
  if (patternCategories.battery?.patterns?.some(pattern => 
    headerName.toLowerCase().includes(pattern.toLowerCase())
  )) {
    return 'battery';
  }
  
  return null;
}

// Get alert settings for a header
function getAlertSettings(headerId, headerName) {
  const currentConfig = getConfig();
    const headerType = getHeaderType(headerName);
  
  if (!headerType) return null;
  
  const categorySettings = currentConfig.patternCategories[headerType];
  const headerSettings = currentConfig.headerSettings[headerId];
  
    return {
    threshold: headerSettings?.threshold ?? categorySettings?.threshold ?? null,
    alertDuration: headerSettings?.alertDuration ?? categorySettings?.alertDuration ?? 20,
    frozenThreshold: headerSettings?.frozenThreshold ?? categorySettings?.frozenThreshold ?? 120
    };
}

// Helper function to check if a value has been below threshold for the required duration
function checkAlertCondition(headerId, headerName, value, threshold, timestamp) {
    // First check if this header is being monitored
    if (!monitoredItems[headerId]) {
        return false;
    }

    if (!alertStates.has(headerId)) {
        alertStates.set(headerId, { 
            startTime: timestamp,
            lastValue: value,
            isActive: false,
            type: getHeaderType(headerName)
        });
        return false;
    }

    const state = alertStates.get(headerId);
    const { alertDuration } = getAlertSettings(headerId, headerName);
    
    if (value < threshold) {
        if (!state.isActive) {
            // Start tracking new potential alert
            state.startTime = timestamp;
            state.isActive = true;
            console.log(`  - Starting alert timer for ${headerId} (${headerName}): Value ${value} < threshold ${threshold}, needs ${alertDuration/1000}s to trigger`);
            return false; // Always return false when we just started tracking
        }
        
        // Check if enough time has passed below threshold
        const timeUnderThreshold = timestamp - state.startTime;
        const shouldAlert = timeUnderThreshold >= alertDuration;
        
        if (shouldAlert) {
            console.log(`  - Alert condition met for ${headerId} (${headerName}): Value ${value} < threshold ${threshold} for ${timeUnderThreshold/1000}s (needed ${alertDuration/1000}s)`);
        } else {
            console.log(`  - Monitoring ${headerId} (${headerName}): Value ${value} < threshold ${threshold} for ${timeUnderThreshold/1000}s (needs ${alertDuration/1000}s to trigger)`);
        }
        
        return shouldAlert;
    } else {
        // Reset alert state when value goes above threshold
        if (state.isActive) {
            console.log(`  - Resetting alert timer for ${headerId} (${headerName}): Value ${value} >= threshold ${threshold}`);
            state.isActive = false;
        }
        return false;
    }
}

// Helper function to check for frozen data
function checkFrozenData(headerId, headerName, value, timestamp) {
    // First check if this header is being monitored
    if (!monitoredItems[headerId]) {
        return false;
    }

    if (!frozenStates.has(headerId)) {
        frozenStates.set(headerId, {
            lastValue: value,
            lastChangeTime: timestamp,
            type: getHeaderType(headerName)
        });
        return false;
    }

    const state = frozenStates.get(headerId);
    const { frozenThreshold } = getAlertSettings(headerId, headerName);

    if (value === state.lastValue) {
        const timeFrozen = timestamp - state.lastChangeTime;
        const isFrozen = timeFrozen >= frozenThreshold;
        
        if (isFrozen) {
            console.log(`  - Frozen data detected for ${headerId} (${headerName}): Value unchanged at ${value} for ${timeFrozen/1000}s (threshold: ${frozenThreshold/1000}s)`);
        }
        
        return isFrozen;
    } else {
        // Update state when value changes
        state.lastValue = value;
        state.lastChangeTime = timestamp;
        return false;
    }
}

// Export the monitoring functions
export async function updateMonitoredItems() {
  // Use a semaphore approach to prevent concurrent modifications
  if (updateMonitoredItems.isRunning) {
    console.log('[' + new Date().toISOString() + '] Another updateMonitoredItems operation is in progress, waiting...');
    // Wait for the current operation to complete before starting a new one
    await new Promise(resolve => {
      const checkInterval = setInterval(() => {
        if (!updateMonitoredItems.isRunning) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  }
  
  try {
    updateMonitoredItems.isRunning = true;
    console.log('[' + new Date().toISOString() + '] Updating monitored headers...');
    
    // Save current state for rollback if needed
    const previousMonitoredItems = { ...monitoredItems };
    
    // Reload configuration
    const configResult = await loadConfig();
    if (!configResult || !configResult.success) {
      throw new Error('Failed to load configuration: ' + (configResult?.error || 'Unknown error'));
    }
    
    // Sync with database to ensure consistency
    const syncResult = await verifyMonitoredItems();
    if (!syncResult) {
      throw new Error('Failed to synchronize monitored items with database');
    }
    
    console.log('[' + new Date().toISOString() + '] Successfully updated monitored headers');
    return true;
  } catch (error) {
    console.error('[' + new Date().toISOString() + '] Error updating monitored headers:', error);
    return false;
  } finally {
    updateMonitoredItems.isRunning = false;
  }
}

// Initialize the static property
updateMonitoredItems.isRunning = false;

/**
 * Loads and validates the monitoring configuration from the database
 * With improved error handling and validation
 */
async function loadConfig() {
  console.log('Loading monitoring configuration...');
  
  // Create backup of current config for fallback
  const previousConfig = {...config};
  let newConfig = null;
  
  try {
    // Load settings from database
    const db = await getDb().catch(err => {
      console.error('Database connection error:', err);
      throw new Error('Failed to connect to database: ' + err.message);
    });
    
    if (!db) {
      throw new Error('Failed to connect to database');
    }
    
    // Load global settings with proper error handling
    let settings = null;
    try {
      settings = await db.get('SELECT * FROM settings ORDER BY id DESC LIMIT 1');
    } catch (settingsError) {
      console.error('Error loading monitoring settings:', settingsError);
      throw new Error('Failed to load monitoring settings: ' + settingsError.message);
    }
    
    if (!settings) {
      console.warn('No monitoring settings found in database, using defaults');
      settings = {
        pollingInterval: 60000, // Default to 1 minute
        patternCategories: JSON.stringify(previousConfig.patternCategories),
        webhooks: JSON.stringify(previousConfig.webhooks),
        lastUpdated: new Date().toISOString()
      };
    }
    
    // Load thresholds with proper error handling
    let thresholds = [];
    try {
      thresholds = await db.all('SELECT * FROM header_thresholds');
    } catch (thresholdsError) {
      console.error('Error loading monitoring thresholds:', thresholdsError);
      throw new Error('Failed to load monitoring thresholds: ' + thresholdsError.message);
    }
    
    // Validate essential settings with defaults
    if (!settings.pollingInterval || typeof settings.pollingInterval !== 'number' || settings.pollingInterval < 5000) {
      console.warn(`Invalid polling interval (${settings.pollingInterval}), defaulting to 60000ms`);
      settings.pollingInterval = 60000; // Default to 1 minute
    }
    
    // Parse JSON fields with error handling
    try {
      settings.patternCategories = settings.patternCategories ? JSON.parse(settings.patternCategories) : {};
      settings.webhooks = settings.webhooks ? JSON.parse(settings.webhooks) : {};
    } catch (parseError) {
      console.error('Error parsing JSON settings:', parseError);
      // Use previous settings as fallback
      settings.patternCategories = previousConfig.patternCategories || {};
      settings.webhooks = previousConfig.webhooks || {};
    }
    
    // Validate pattern categories
    if (!settings.patternCategories || typeof settings.patternCategories !== 'object') {
      console.warn('Invalid patternCategories, using defaults');
      settings.patternCategories = previousConfig.patternCategories || {
        pressure: {
          patterns: ["pressure", "casing", "tubing", "cbt"],
          negativePatterns: ["fdi", "derivative", "projected", "curve", "predicted"],
          threshold: 20,
          alertDuration: 20,
          frozenThreshold: 120
        },
        battery: {
          patterns: ["bat", "battery"],
          threshold: 20,
          alertDuration: 120,
          frozenThreshold: 300
        }
      };
    }
    
    // Check if polling interval has changed
    const previousInterval = previousConfig ? previousConfig.pollingInterval : null;
    const intervalChanged = previousInterval && previousInterval !== settings.pollingInterval;
    
    // Create new config
    newConfig = {
      ...settings,
      thresholds: thresholds.reduce((acc, t) => {
        acc[t.header_id] = {
          warning: t.warning_threshold,
          alert: t.alert_threshold,
          version: t.version,
          lastUpdated: t.last_updated
        };
        return acc;
      }, {})
    };
    
    // Update global config only after all processing succeeds
    config = newConfig;
    
    // Log loaded configuration
    console.log(`Loaded monitoring settings: pollingInterval=${config.pollingInterval}ms, patternCategories=${Object.keys(config.patternCategories).length}, webhooks=${config.webhooks ? 'enabled' : 'disabled'}`);
    console.log(`Loaded ${thresholds.length} thresholds`);
    
    // If polling interval changed, restart monitoring
    if (intervalChanged) {
      console.log(`Polling interval changed from ${previousInterval}ms to ${config.pollingInterval}ms, restarting monitoring...`);
      await stopMonitoring();
      await startMonitoring();
    }
    
    return { success: true, config };
  } catch (error) {
    console.error('Failed to load configuration:', error);
    // Log details about the fallback
    console.warn('Using previous configuration as fallback');
    return { success: false, error: error.message, usingFallback: true };
  }
}

// Function to get current config
function getConfig() {
  return config;
}

// Fetch header value from FracBrain API
async function fetchHeaderValue(headerId) {
    const url = `${FRACBRAIN_API_BASE}/stages/datum/${headerId}`;
    const headers = {
        'Authorization': `Bearer ${FRACBRAIN_TOKEN}`,
        'Content-Type': 'application/json',
        'accept': 'application/json'
    };
    const fetchStartTime = Date.now();

    try {
        const response = await fetch(url, { 
            headers,
            credentials: 'omit' // Don't send cookies
        });
        const fetchDuration = Date.now() - fetchStartTime;

        if (!response.ok) {
            let errorBody = 'unknown error';
            try { errorBody = await response.text(); } catch (e) { /* ignore */ }
            console.error(`[${new Date().toISOString()}] API Error for header ${headerId}: ${response.status} ${response.statusText} - ${errorBody} (took ${fetchDuration}ms)`);
            return { value: null, error: `API Error: ${response.status}`, timestamp: Date.now() };
        }

        if (response.status === 204) {
            return { value: null, error: null, timestamp: Date.now() }; 
        }

        const data = await response.json();
        
        // Debug log the raw response structure
        // console.debug(`[${new Date().toISOString()}] Raw API response structure for header ${headerId}:`, 
        //     Object.keys(data).length > 0 ? Object.keys(data) : 'empty response');

        // Validate the response structure
        if (!data || typeof data !== 'object') {
            console.error(`[${new Date().toISOString()}] Invalid response format for header ${headerId}: not an object`);
            return { value: null, error: 'Invalid response format', timestamp: Date.now() };
        }

        // The response contains metadata and a data array
        const metadata = {
            id: data.data?.id,
            name: data.data?.name,
            startTimestamp: data.data?.startTimestamp,
            endTimestamp: data.data?.endTimestamp,
            state: data.data?.state
        };

        // Get the actual data array
        const dataPoints = data.data?.data;
        
        if (!Array.isArray(dataPoints)) {
            console.error(`[${new Date().toISOString()}] Invalid data format for header ${headerId}: data is not an array`);
            return { value: null, error: 'Invalid data format', timestamp: Date.now() };
        }

        // Get the last non-null value from the array
        let latestValue = null;
        for (let i = dataPoints.length - 1; i >= 0; i--) {
            if (dataPoints[i] !== null) {
                latestValue = dataPoints[i];
                break;
            }
        }

        // Convert to number if possible
        if (latestValue !== null && !isNaN(latestValue)) {
            latestValue = Number(latestValue);
        }

        console.log(`[${new Date().toISOString()}] Fetched value for ${headerId}: ${latestValue} (from array of ${dataPoints.length} points, took ${fetchDuration}ms)`);
        
        return { 
            value: latestValue, 
            error: null, 
            timestamp: Date.now(),
            metadata,
            dataPoints: dataPoints.slice(-5), // Keep last 5 points for trend analysis
            totalPoints: dataPoints.length
        };

    } catch (error) {
        const fetchDuration = Date.now() - fetchStartTime;
        console.error(`[${new Date().toISOString()}] Network/Fetch Error for header ${headerId}:`, error.message, `(took ${fetchDuration}ms)`);
        return { 
            value: null, 
            error: error.message,
            timestamp: Date.now()
        };
    }
}

// TODO: Add function to check threshold breaches and frozen data
// function checkHeaderStatus(headerId, value, threshold, timestamp) { ... }

// TODO: Add function to send Slack notification
// async function sendSlackAlert(message) { ... }


// --- Main Monitoring Loop ---

// Run a monitoring cycle
async function runMonitoringCycle() {
    // Skip if shutdown is in progress or already running
    if (stopMonitoring.isShuttingDown) {
        console.log(`[${new Date().toISOString()}] Skipping monitoring cycle: Shutdown in progress`);
        return {
            skipped: true,
            reason: 'shutdown_in_progress'
        };
    }
    
    if (runMonitoringCycle.isRunning && !runMonitoringCycle.isFirstRun) {
        console.log(`[${new Date().toISOString()}] Skipping monitoring cycle: Previous cycle still running`);
        return {
            skipped: true,
            reason: 'cycle_in_progress'
        };
    }
    
    // Mark as running
    runMonitoringCycle.isRunning = true;

    // Update health status
    healthStatus.lastMonitoringCycle = new Date().toISOString();
    
    const currentConfig = getConfig();
    console.log(`[${new Date().toISOString()}] Running monitoring cycle...`);
  
    try {
        // Prune old state data every hour (check based on current minute)
        const currentMinute = new Date().getMinutes();
        if (currentMinute === 0) { // Run at the top of every hour
            pruneStates();
        }
        
        // Verify monitoredItems matches database state
        await verifyMonitoredItems();
        
        // Every 10th cycle (or using another metric), run duplicate header cleanup
        if (currentMinute % 5 === 0) { // Run every 5 minutes
            console.log(`[${new Date().toISOString()}] Running scheduled duplicate header cleanup...`);
            try {
                const cleanupCount = await HeaderMonitorService.cleanupDuplicateHeaders();
                console.log(`[${new Date().toISOString()}] Scheduled cleanup removed ${cleanupCount} duplicate headers`);
            } catch (error) {
                console.error(`[${new Date().toISOString()}] Error in scheduled duplicate header cleanup:`, error);
            }
        }
        
        // Get all monitored headers
        const { headerValues, alerts } = await HeaderMonitorService.monitorAllHeaders();
        
        // Check for stage transitions
        try {
            console.log(`[${new Date().toISOString()}] Checking for stage transitions...`);
            const token = FRACBRAIN_TOKEN; // Use the global FRACBRAIN_TOKEN variable instead of getFracBrainToken function
            
            if (!token) {
                console.error('No FracBrain API token found for stage transition check');
            } else {
                const apiHeaders = {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                };
                
                // Fetch current active stages
                const stagesResponse = await fetch(`${FRACBRAIN_API_BASE}/stages/active/stages`, { 
                    headers: apiHeaders,
                    credentials: 'omit'
                });
                
                if (stagesResponse.ok) {
                    const stagesData = await stagesResponse.json();
                    const activeStages = stagesData.stages || [];
                    
                    // Get last known active stages from database
                    const db = await getDb();
                    const previousStages = await db.all(`
                      SELECT project_id, stage_id FROM active_projects 
                      WHERE is_deleted = 0 AND stage_id IS NOT NULL
                    `);
                    
                    // Create a map of project_id to stage_id for quick lookup
                    const previousStagesMap = {};
                    previousStages.forEach(stage => {
                        previousStagesMap[stage.project_id] = stage.stage_id;
                    });
                    
                    // For each newly fetched active stage, check if the stage for that project has changed
                    for (const newStage of activeStages) {
                        const projectId = newStage.projectId;
                        const newStageId = newStage.stageId;
                        
                        // Skip if no projectId or stageId
                        if (!projectId || !newStageId) continue;
                        
                        // Check if we have a previous stage for this project
                        const prevStageId = previousStagesMap[projectId];
                        
                        // If we have a previous stage and it's different, handle the transition
                        if (prevStageId && prevStageId !== newStageId) {
                            console.log(`[${new Date().toISOString()}] Stage transition detected for project ${projectId}: ${prevStageId} -> ${newStageId}`);
                            
                            // Call our header mapping function to maintain monitoring across the transition
                            await HeaderMonitorService.updateMonitoredHeadersForNewStage(prevStageId, newStageId);
                        }
                    }
                    
                    // Update active_projects with new stage info
                    await upsertActiveProjects(activeStages);
                } else {
                    console.error(`[${new Date().toISOString()}] Failed to fetch active stages for transition check: ${stagesResponse.status}`);
                }
            }
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Error checking for stage transitions:`, error);
            // Continue with the monitoring cycle even if stage transition check fails
        }
        
        // Process alerts to update alert states
        if (alerts && Array.isArray(alerts)) {
            alerts.forEach(alert => {
                // Make sure we're using the right property names (companyId and stageId)
                if (alert.headerId && alert.companyId && alert.stageId) {
                    // Create a unique key for the alert
                    const alertKey = `${alert.type}_${alert.headerId}_${Date.now()}`;
                    
                    // Add to alert states with the correct property structure
                    alertStates.set(alertKey, {
                        id: alertKey,
                        headerId: alert.headerId,
                        value: alert.value,
                        threshold: alert.threshold,
                        timestamp: alert.timestamp,
                        companyId: alert.companyId,
                        stageId: alert.stageId,
                        type: alert.type,
                        message: alert.message || `Value ${alert.value} breached threshold ${alert.threshold}`
                    });
                    
                    console.log(`[${new Date().toISOString()}] Added alert: ${alertKey} for header ${alert.headerId}`);
                }
            });
        } else {
            console.log(`[${new Date().toISOString()}] No alerts to process in this cycle`);
        }
        
        // Process header values to update frozen states
        if (headerValues && typeof headerValues === 'object') {
            Object.entries(headerValues).forEach(([headerId, headerData]) => {
                if (headerData.companyId && headerData.stageId) {
                    const lastValue = lastHeaderValues[headerId]?.value;
                    const lastTimestamp = lastHeaderValues[headerId]?.timestamp || 0;
                    
                    // If we have a previous value and it hasn't changed
                    if (lastValue !== undefined && lastValue === headerData.value) {
                        const timeFrozen = headerData.timestamp - lastTimestamp;
                        const frozenThreshold = headerData.frozenThreshold || 60000; // Default to 60 seconds
                        
                        // If frozen for longer than the threshold, create a frozen state
                        if (timeFrozen >= frozenThreshold) {
                            const frozenKey = `frozen_${headerId}_${Date.now()}`;
                            
                            frozenStates.set(frozenKey, {
                                id: frozenKey,
                                headerId: headerId,
                                value: headerData.value,
                                timestamp: headerData.timestamp,
                                companyId: headerData.companyId,
                                stageId: headerData.stageId,
                                type: 'frozen',
                                message: `Value unchanged for ${Math.floor(timeFrozen/1000)} seconds`
                            });
                            
                            console.log(`[${new Date().toISOString()}] Added frozen state: ${frozenKey} for header ${headerId}`);
                        }
                    }
                    
                    // Update last header value
                    lastHeaderValues[headerId] = {
                        value: headerData.value,
                        timestamp: headerData.timestamp
                    };
                }
            });
        } else {
            console.log(`[${new Date().toISOString()}] No header values to process in this cycle`);
        }
        
        // Update monitoring status
        const monitoringStatus = {
            headerValues,
            alerts,
            lastUpdated: new Date().toISOString(),
            config: {
                pollingInterval: currentConfig.pollingInterval,
                patternCategories: currentConfig.patternCategories
            }
        };

        // Send notifications if enabled
        if (currentConfig.webhooks?.enabled && alerts.length > 0) {
            await checkAndSendNotifications(alerts);
        }

        // Log monitoring results
        console.log(`[${new Date().toISOString()}] Monitoring cycle complete:`, {
            headerCount: Object.keys(headerValues).length,
            alertCount: alerts.length,
            alertStatesCount: alertStates.size,
            frozenStatesCount: frozenStates.size
        });

        // Update successful health status
        healthStatus.lastSuccessfulCycle = new Date().toISOString();
        healthStatus.consecutiveErrors = 0;

        return monitoringStatus;
    } catch (error) {
        // Update health status on error
        healthStatus.consecutiveErrors++;
        if (healthStatus.consecutiveErrors >= 3) {
            healthStatus.isHealthy = false;
            healthStatus.lastErrorMessage = `${healthStatus.consecutiveErrors} consecutive monitoring errors: ${error.message}`;
        }
        
        console.error(`[${new Date().toISOString()}] Error in monitoring cycle:`, error);
        return {
            headerValues: {},
            alerts: [],
            lastUpdated: new Date().toISOString(),
            error: error.message
        };
    } finally {
        // Always mark as no longer running
        runMonitoringCycle.isRunning = false;
    }
}

// --- Initialization ---

// Removed the conflicting initialization block that was previously here.
// Initialization is now handled by initializeMonitoring and startMonitoring, called from main.

// Initialize the monitoring service
async function initializeMonitoring() {
  console.log('--- Backend Monitoring Service Initializing ---');
  
  try {
    // Initialize database first
    await initDatabase();
    
    // Load initial configuration
    const configLoaded = await loadConfig(); // loadConfig updates the global 'config' variable
    if (!configLoaded) {
      throw new Error('Failed to load initial configuration');
    }
    
    // Setup enhanced watcher with retry and recovery mechanisms
    let watcherReady = false;
    const maxWatcherRetries = 3;
    let watcherRetryCount = 0;
    
    const setupWatcher = () => {
      try {
        console.log(`Setting up configuration file watcher (attempt ${watcherRetryCount + 1}/${maxWatcherRetries})...`);
        
        // Close any existing watcher before creating a new one
        if (global.configWatcher) {
          try {
            global.configWatcher.close();
            console.log('Closed existing config watcher');
          } catch (closeError) {
            console.warn('Error closing existing watcher:', closeError);
          }
        }
        
        const watcher = chokidar.watch([SETTINGS_PATH, THRESHOLDS_PATH], { 
          ignoreInitial: true,
          awaitWriteFinish: {
            stabilityThreshold: 2000,
            pollInterval: 100
          },
          persistent: true,
          usePolling: true, // More reliable but higher CPU usage
          interval: 3000 // Poll every 3 seconds
        });
        
        watcher.on('ready', () => {
          console.log('File watcher ready and monitoring config files');
          watcherReady = true;
          watcherRetryCount = 0; // Reset retry counter on success
        });

        watcher.on('change', async (filePath) => {
          console.log(`\n[${new Date().toISOString()}] Config file changed: ${path.basename(filePath)}. Reloading...`);
          await loadConfig(); // Reloads settings/thresholds and restarts monitoring if interval changed
        });
        
        watcher.on('error', error => {
          console.error(`[${new Date().toISOString()}] File watcher error:`, error);
          
          // Attempt recovery if watcher fails
          if (watcherRetryCount < maxWatcherRetries) {
            watcherRetryCount++;
            console.log(`Attempting to recover file watcher (retry ${watcherRetryCount}/${maxWatcherRetries})`);
            
            // Try to close the watcher before recreating
            try {
              watcher.close();
            } catch (closeError) {
              console.warn('Error closing failed watcher:', closeError);
            }
            
            // Wait before retrying
            setTimeout(() => {
              setupWatcher();
            }, 5000 * watcherRetryCount); // Increasing backoff
          } else {
            console.error('Max file watcher retries reached, falling back to periodic config reload');
          }
        });
        
        // Keep a reference to the watcher for potential cleanup
        global.configWatcher = watcher;
        
        // Setup periodic forced reload regardless of watcher status
        const forcedReloadInterval = 15 * 60 * 1000; // 15 minutes
        console.log(`Setting up forced configuration reload every ${forcedReloadInterval/60000} minutes`);
        
        setInterval(async () => {
          console.log(`[${new Date().toISOString()}] Performing scheduled forced configuration reload`);
          await loadConfig();
        }, forcedReloadInterval);
        
        return watcher;
      } catch (watcherError) {
        console.error('Error setting up file watcher:', watcherError);
        if (watcherRetryCount < maxWatcherRetries) {
          watcherRetryCount++;
          console.log(`Will retry watcher setup in 5 seconds (retry ${watcherRetryCount}/${maxWatcherRetries})`);
          setTimeout(() => {
            setupWatcher();
          }, 5000);
        } else {
          console.error('Failed to setup file watcher after multiple attempts');
          throw watcherError;
        }
      }
    };
    
    // Initialize the watcher
    setupWatcher();
    
    console.log('[Monitor] Monitoring initialization complete');
    return true;
  } catch (error) {
    console.error('[Monitor] Failed to initialize monitoring:', error);
    return false;
  }
}

// Start the monitoring loop
async function startMonitoring() {
    // Check if monitoring is already running
    if (monitoringInterval) {
        console.log(`[${new Date().toISOString()}] Monitoring is already running, restarting...`);
        await stopMonitoring();
    }
    
    // Check if shutdown is in progress
    if (stopMonitoring.isShuttingDown) {
        console.log(`[${new Date().toISOString()}] Shutdown in progress, delaying start...`);
        // Wait for shutdown to complete before starting
        await new Promise(resolve => {
            const checkInterval = setInterval(() => {
                if (!stopMonitoring.isShuttingDown) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 100);
        });
    }
    
    try {
        console.log(`[${new Date().toISOString()}] Starting monitoring service...`);
        
        // Make sure we have the latest configuration
        await loadConfig();
        
        // Make sure we have the latest monitored items
        await verifyMonitoredItems();
        
        // Get the polling interval from config
        const pollingInterval = config.pollingInterval || 5; // Default to 5 seconds if not set
        console.log(`[${new Date().toISOString()}] Starting monitoring with ${pollingInterval} second interval`);
        
        // Track startup time in health status
        healthStatus.startTime = new Date().toISOString();
        
        // Run initial monitoring cycle immediately (wait for it to complete)
        try {
            runMonitoringCycle.isFirstRun = true;
            console.log(`[${new Date().toISOString()}] Running initial monitoring cycle...`);
            await runMonitoringCycle();
            console.log(`[${new Date().toISOString()}] Initial monitoring cycle completed successfully`);
        } catch (initialCycleError) {
            console.error(`[${new Date().toISOString()}] Error in initial monitoring cycle:`, initialCycleError);
            // Continue with scheduled monitoring even if initial cycle fails
        } finally {
            runMonitoringCycle.isFirstRun = false;
        }
        
        // Start new monitoring interval (don't wait for previous one to finish)
        monitoringInterval = setInterval(() => {
            // Skip interval tick if a cycle is already running or shutdown is in progress
            if (runMonitoringCycle.isRunning || stopMonitoring.isShuttingDown) {
                console.log(`[${new Date().toISOString()}] Skipping monitoring cycle: ${runMonitoringCycle.isRunning ? 'Previous cycle still running' : 'Shutdown in progress'}`);
                return;
            }
            
            // Skip interval tick if a previous cycle is still pending
            if (runMonitoringCycle.pending) {
                console.log(`[${new Date().toISOString()}] Skipping monitoring cycle: Previous cycle execution still pending`);
                return;
            }
            
            // Execute the monitoring cycle
            runMonitoringCycle.pending = true;
            runMonitoringCycle()
                .catch(error => {
                    console.error(`[${new Date().toISOString()}] Error in monitoring cycle:`, error);
                })
                .finally(() => {
                    runMonitoringCycle.pending = false;
                });
        }, pollingInterval * 1000);
        
        // Initialize runMonitoringCycle helper properties
        runMonitoringCycle.isRunning = false;
        runMonitoringCycle.pending = false;
        
        console.log(`[${new Date().toISOString()}] Monitoring service started successfully`);
        return true;
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error starting monitoring:`, error);
        return false;
    }
}

// Send notifications for alerts
async function checkAndSendNotifications(alerts) {
  try {
    const currentConfig = getConfig();
    
    if (!currentConfig.webhooks?.enabled || alerts.length === 0) {
    return;
  }

    console.log(`[${new Date().toISOString()}] Sending notifications for ${alerts.length} alerts`);
    await sendAlertNotifications(alerts);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error sending notifications:`, error);
  }
}

// Export config getter
export { getConfig };

// Add these exports near the bottom of the file, before the main() export
export function getAlertStates() {
  return alertStates;
}

export function getFrozenStates() {
  return frozenStates;
}

// Variable to store the monitoring interval
let monitoringInterval = null;

export async function stopMonitoring() {
    console.log(`[${new Date().toISOString()}] Stopping monitoring service...`);
    
    // Flag to indicate monitoring is stopping (to prevent new cycles from starting)
    stopMonitoring.isShuttingDown = true;
    
    return new Promise((resolve) => {
        if (monitoringInterval) {
            clearInterval(monitoringInterval);
            monitoringInterval = null;
            console.log(`[${new Date().toISOString()}] Cleared monitoring interval`);
        }
        
        // Check if a monitoring cycle is currently running
        if (runMonitoringCycle.isRunning) {
            console.log(`[${new Date().toISOString()}] Waiting for active monitoring cycle to complete before shutdown...`);
            
            // Wait for the current cycle to finish before resolving
            const checkInterval = setInterval(() => {
                if (!runMonitoringCycle.isRunning) {
                    clearInterval(checkInterval);
                    console.log(`[${new Date().toISOString()}] Active monitoring cycle completed, proceeding with shutdown`);
                    finishShutdown();
                }
            }, 100);
            
            // Safety timeout - resolve after 30 seconds even if cycle hasn't finished
            setTimeout(() => {
                clearInterval(checkInterval);
                console.warn(`[${new Date().toISOString()}] Forced shutdown after timeout waiting for monitoring cycle`);
                finishShutdown();
            }, 30000);
        } else {
            finishShutdown();
        }
        
        function finishShutdown() {
            // Clear all states
            alertStates.clear();
            frozenStates.clear();
            activeAlerts = {};
            // Don't clear lastHeaderValues to maintain data continuity for the next startup
            lastNotificationTime = null;
            
            // Reset shutdown flag
            stopMonitoring.isShuttingDown = false;
            console.log(`[${new Date().toISOString()}] Monitoring service stopped`);
            resolve(true);
        }
    });
}

// Initialize the static property
stopMonitoring.isShuttingDown = false;

// Export the main function which orchestrates initialization and start
export async function main() {
    try {
        // Test API connection first
        const apiTestResult = await testFracBrainToken();
        if (!apiTestResult) {
            console.error('Failed to connect to FracBrain API. Please check your token and API base URL.');
            return false;
        }

        // Load configuration
        await loadConfig();

        // Initialize monitoring
        await initializeMonitoring();

        // Start monitoring if not in test mode
        if (process.env.NODE_ENV !== 'test') {
            await startMonitoring();
        }

        return true;
    } catch (error) {
        console.error('Error in main:', error);
        return false;
    }
}

// Function to verify that monitoredItems in memory matches database state
async function verifyMonitoredItems() {
  try {
    console.log(`[${new Date().toISOString()}] Verifying monitored items match database state...`);
    
    // Get monitored headers from database with proper error handling
    const db = await getDb();
    if (!db) {
      throw new Error('Failed to get database connection');
    }
    
    let monitoredHeadersFromDb = [];
    try {
      monitoredHeadersFromDb = await db.all(`
        SELECT 
          phs.header_id, 
          phs.threshold, 
          phs.frozen_threshold, 
          phs.alert_duration,
          phs.header_name,
          phs.project_id,
          ap.company_id,
          ap.stage_id
        FROM project_header_settings phs
        JOIN active_projects ap ON phs.project_id = ap.project_id
        WHERE phs.is_monitored = 1
        AND ap.is_deleted = 0
      `);
    } catch (dbError) {
      console.error(`[${new Date().toISOString()}] Database error fetching monitored headers:`, dbError);
      // Don't throw here - we'll use existing monitoredItems as fallback
      return false;
    }

    // Create sets for comparison
    const dbHeaderIds = new Set(monitoredHeadersFromDb.map(h => h.header_id));
    const memoryHeaderIds = new Set(Object.keys(monitoredItems));

    // Track changes for logging
    const changes = {
      added: 0,
      removed: 0,
      updated: 0,
      unchanged: 0
    };

    // Find headers in memory but not in database (should be removed)
    const headersToRemove = [...memoryHeaderIds].filter(id => !dbHeaderIds.has(id));
    
    // Find headers in database but not in memory (should be added)
    const headersToAdd = monitoredHeadersFromDb.filter(h => !memoryHeaderIds.has(h.header_id));
    
    // Find headers that exist in both but might have updated settings
    const headersToUpdate = monitoredHeadersFromDb.filter(h => 
      memoryHeaderIds.has(h.header_id) && 
      (
        monitoredItems[h.header_id].threshold !== h.threshold ||
        monitoredItems[h.header_id].frozenThreshold !== h.frozen_threshold ||
        monitoredItems[h.header_id].alertDuration !== h.alert_duration
      )
    );

    // Update monitoredItems if needed
    if (headersToRemove.length > 0 || headersToAdd.length > 0 || headersToUpdate.length > 0) {
      console.log(`[${new Date().toISOString()}] Synchronizing monitoredItems with database:`);
      
      // Remove headers no longer monitored
      if (headersToRemove.length > 0) {
        console.log(`  - Removing ${headersToRemove.length} headers no longer monitored in database`);
        for (const id of headersToRemove) {
          console.log(`    - Removing: ${id}`);
          delete monitoredItems[id];
          
          // Also clear any alert/frozen states for this header
          for (const [key, state] of alertStates.entries()) {
            if (state.headerId === id) {
              alertStates.delete(key);
            }
          }
          
          for (const [key, state] of frozenStates.entries()) {
            if (state.headerId === id) {
              frozenStates.delete(key);
            }
          }
          
          changes.removed++;
        }
      }

      // Add new headers
      if (headersToAdd.length > 0) {
        console.log(`  - Adding ${headersToAdd.length} new headers from database`);
        for (const header of headersToAdd) {
          console.log(`    - Adding: ${header.header_id} (${header.header_name})`);
          monitoredItems[header.header_id] = {
            threshold: header.threshold,
            frozenThreshold: header.frozen_threshold,
            alertDuration: header.alert_duration,
            headerName: header.header_name,
            projectId: header.project_id,
            companyId: header.company_id,
            stageId: header.stage_id
          };
          changes.added++;
        }
      }

      // Update existing headers with new settings
      if (headersToUpdate.length > 0) {
        console.log(`  - Updating settings for ${headersToUpdate.length} existing headers`);
        for (const header of headersToUpdate) {
          console.log(`    - Updating: ${header.header_id} (${header.header_name})`);
          monitoredItems[header.header_id] = {
            ...monitoredItems[header.header_id], // Preserve other properties
            threshold: header.threshold,
            frozenThreshold: header.frozen_threshold,
            alertDuration: header.alert_duration,
            headerName: header.header_name,
            projectId: header.project_id,
            companyId: header.company_id,
            stageId: header.stage_id
          };
          changes.updated++;
        }
      }
    } else {
      changes.unchanged = memoryHeaderIds.size;
      console.log(`[${new Date().toISOString()}] Monitored items already in sync with database (${changes.unchanged} items)`);
    }

    // Log detailed stats about the verification process
    console.log(`[${new Date().toISOString()}] Monitored items verification complete:`, changes);
    return true;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error verifying monitored items:`, error);
    // Don't throw - continue with current state as fallback
    return false;
  }
}

/**
 * Handle stage transitions for projects
 * @param {Object} options - Stage transition options
 * @param {string} options.projectId - The project ID
 * @param {string} options.fromStage - The previous stage
 * @param {string} options.toStage - The new stage
 * @returns {Object} - Results of the transition handling
 */
async function handleStageTransition({ projectId, fromStage, toStage }) {
  console.log(`Handling stage transition for project ${projectId}: ${fromStage} → ${toStage}`);
  
  try {
    if (!projectId) {
      throw new Error('Project ID is required for stage transition');
    }
    
    // Clean up duplicate headers whenever we handle a stage transition
    await headerMonitorService.cleanupDuplicateHeaders(projectId);
    
    // Handle specific stage transitions
    if (toStage === 'complete') {
      // When project is complete, disable monitoring for all headers
      console.log(`Project ${projectId} completed, disabling monitoring for all headers`);
      await disableMonitoringForProject(projectId);
      return { success: true, action: 'disabled_monitoring', projectId };
    }
    
    // When transitioning from planning to execution, enable monitoring for configured headers
    if (fromStage === 'planning' && toStage === 'execution') {
      console.log(`Project ${projectId} moved to execution stage, enabling monitoring for configured headers`);
      await enableMonitoringForProject(projectId);
      return { success: true, action: 'enabled_monitoring', projectId };
    }
    
    // For other transitions, just log and make no changes
    console.log(`No specific monitoring actions for transition ${fromStage} → ${toStage}`);
    return { success: true, action: 'no_change', projectId };
  } catch (error) {
    console.error(`Error handling stage transition for project ${projectId}:`, error);
    return { success: false, error: error.message, projectId };
  }
}

/**
 * Disable monitoring for all headers in a project
 * @param {string} projectId - The project ID
 */
async function disableMonitoringForProject(projectId) {
  try {
    const db = await getDb();
    if (!db) throw new Error('Failed to connect to database');
    
    // Update database to disable monitoring for all headers
    const result = await db.run(`
      UPDATE project_header_settings
      SET is_monitored = 0, 
          last_updated = datetime('now')
      WHERE project_id = ?
    `, [projectId]);
    
    console.log(`Disabled monitoring for ${result.changes} headers in project ${projectId}`);
    
    // Update in-memory monitored items
    updateMonitoredItems();
    
    return { success: true, disabledCount: result.changes };
  } catch (error) {
    console.error(`Failed to disable monitoring for project ${projectId}:`, error);
    throw error;
  }
}

/**
 * Enable monitoring for configured headers in a project
 * @param {string} projectId - The project ID
 */
async function enableMonitoringForProject(projectId) {
  try {
    const db = await getDb();
    if (!db) throw new Error('Failed to connect to database');
    
    // Get headers that should be monitored based on configuration
    const headers = await db.all(`
      SELECT header_id FROM project_headers 
      WHERE project_id = ? AND 
            header_id IN (SELECT header_id FROM monitoring_thresholds)
    `, [projectId]);
    
    if (headers.length === 0) {
      console.log(`No monitorable headers found for project ${projectId}`);
      return { success: true, enabledCount: 0 };
    }
    
    let enabledCount = 0;
    
    // Enable monitoring for each header with configured thresholds
    for (const header of headers) {
      try {
        // Check if settings entry exists
        const existing = await db.get(`
          SELECT id FROM project_header_settings
          WHERE project_id = ? AND header_id = ?
        `, [projectId, header.header_id]);
        
        if (existing) {
          // Update existing entry
          await db.run(`
            UPDATE project_header_settings
            SET is_monitored = 1,
                last_updated = datetime('now')
            WHERE id = ?
          `, [existing.id]);
        } else {
          // Create new entry
          await db.run(`
            INSERT INTO project_header_settings
            (project_id, header_id, is_monitored, last_updated)
            VALUES (?, ?, 1, datetime('now'))
          `, [projectId, header.header_id]);
        }
        
        enabledCount++;
      } catch (headerError) {
        console.error(`Error enabling monitoring for header ${header.header_id}:`, headerError);
        // Continue with other headers
      }
    }
    
    console.log(`Enabled monitoring for ${enabledCount} headers in project ${projectId}`);
    
    // Update in-memory monitored items
    updateMonitoredItems();
    
    return { success: true, enabledCount };
  } catch (error) {
    console.error(`Failed to enable monitoring for project ${projectId}:`, error);
    throw error;
  }
}

// Add these functions for memory management

/**
 * Prune old entries from alertStates and frozenStates to prevent memory leaks
 * @param {number} maxAgeMs - Maximum age of states to keep (in milliseconds)
 */
function pruneStates(maxAgeMs = 24 * 60 * 60 * 1000) { // Default: 24 hours
  const now = Date.now();
  let alertPruneCount = 0;
  let frozenPruneCount = 0;
  
  // Prune alert states
  for (const [key, state] of alertStates.entries()) {
    if (state.timestamp && (now - new Date(state.timestamp).getTime() > maxAgeMs)) {
      alertStates.delete(key);
      alertPruneCount++;
    }
  }
  
  // Prune frozen states
  for (const [key, state] of frozenStates.entries()) {
    if (state.timestamp && (now - new Date(state.timestamp).getTime() > maxAgeMs)) {
      frozenStates.delete(key);
      frozenPruneCount++;
    }
  }
  
  if (alertPruneCount > 0 || frozenPruneCount > 0) {
    console.log(`[${new Date().toISOString()}] Pruned ${alertPruneCount} alert states and ${frozenPruneCount} frozen states older than ${maxAgeMs/1000/60/60} hours`);
  }
  
  // Also clean up last header values that aren't being monitored anymore
  const monitoredHeaderIds = Object.keys(monitoredItems);
  const lastHeaderValueKeys = Object.keys(lastHeaderValues);
  
  let headerValuesPruned = 0;
  for (const headerId of lastHeaderValueKeys) {
    if (!monitoredHeaderIds.includes(headerId)) {
      delete lastHeaderValues[headerId];
      headerValuesPruned++;
    }
  }
  
  if (headerValuesPruned > 0) {
    console.log(`[${new Date().toISOString()}] Pruned ${headerValuesPruned} entries from lastHeaderValues for headers no longer monitored`);
  }
  
  return {
    alertPruneCount,
    frozenPruneCount,
    headerValuesPruned
  };
}

/**
 * Perform a comprehensive health check of the monitoring system
 * @returns {Object} Health status object
 */
async function checkMonitoringHealth() {
  console.log(`[${new Date().toISOString()}] Performing monitoring system health check`);
  
  try {
    // Record check time
    healthStatus.lastHealthCheck = new Date().toISOString();
    
    // Check monitoring activity - alert if no monitoring cycle in 2x expected interval
    const expectedInterval = (config?.pollingInterval || 60) * 1000;
    const maxAcceptableGap = expectedInterval * 2;
    
    if (healthStatus.lastMonitoringCycle) {
      const timeSinceLastCycle = Date.now() - new Date(healthStatus.lastMonitoringCycle).getTime();
      if (timeSinceLastCycle > maxAcceptableGap) {
        healthStatus.isHealthy = false;
        healthStatus.lastErrorMessage = `Monitoring cycles have stopped: Last cycle was ${Math.round(timeSinceLastCycle/1000)}s ago, expected every ${expectedInterval/1000}s`;
        console.error(`[Health Check] ${healthStatus.lastErrorMessage}`);
      }
    }
    
    // Check database connection
    try {
      const db = await getDb();
      await db.get('SELECT 1'); // Test query
      healthStatus.databaseConnectionOk = true;
    } catch (dbError) {
      healthStatus.databaseConnectionOk = false;
      healthStatus.isHealthy = false;
      healthStatus.lastErrorMessage = `Database connection failed: ${dbError.message}`;
      console.error(`[Health Check] ${healthStatus.lastErrorMessage}`);
    }
    
    // Check FracBrain API connection
    try {
      const token = FRACBRAIN_TOKEN;
      const apiResponse = await fetch(`${FRACBRAIN_API_BASE}/stages/active/stages`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'accept': 'application/json'
        },
        credentials: 'omit',
        timeout: 10000 // 10 second timeout
      });
      
      if (apiResponse.ok) {
        healthStatus.apiConnectionOk = true;
      } else {
        throw new Error(`API returned status ${apiResponse.status}`);
      }
    } catch (apiError) {
      healthStatus.apiConnectionOk = false;
      healthStatus.isHealthy = false;
      healthStatus.lastErrorMessage = `API connection failed: ${apiError.message}`;
      console.error(`[Health Check] ${healthStatus.lastErrorMessage}`);
    }
    
    // Check memory usage
    const memoryUsage = process.memoryUsage();
    const memoryUsageMB = Math.round(memoryUsage.rss / 1024 / 1024 * 100) / 100;
    console.log(`[Health Check] Memory usage: ${memoryUsageMB} MB`);
    
    // Check monitored items count vs database
    try {
      const db = await getDb();
      const dbCount = await db.get('SELECT COUNT(*) as count FROM project_header_settings WHERE is_monitored = 1');
      const memoryCount = Object.keys(monitoredItems).length;
      
      if (Math.abs(dbCount.count - memoryCount) > 5) { // Allow small differences due to timing
        console.warn(`[Health Check] Monitored items count mismatch: ${memoryCount} in memory vs ${dbCount.count} in database`);
        // Force sync if too far out of sync
        await verifyMonitoredItems();
      }
    } catch (countError) {
      console.error(`[Health Check] Error checking monitored items count: ${countError.message}`);
    }
    
    // If everything checked out OK and we previously had an error, reset health status
    if (healthStatus.isHealthy === false && 
        healthStatus.databaseConnectionOk && 
        healthStatus.apiConnectionOk && 
        healthStatus.configLoadOk) {
      healthStatus.isHealthy = true;
      healthStatus.lastErrorMessage = null;
      console.log('[Health Check] System returned to healthy state');
    }
    
    return {...healthStatus};
  } catch (error) {
    console.error('[Health Check] Error during health check:', error);
    healthStatus.isHealthy = false;
    healthStatus.lastErrorMessage = `Health check failed: ${error.message}`;
    return {...healthStatus};
  }
}

// Schedule regular health checks
setInterval(async () => {
  await checkMonitoringHealth();
}, 5 * 60 * 1000); // Check every 5 minutes

// Add a new API endpoint for health check
// Add this to the Express app setup
app.get('/api/health', async (req, res) => {
  try {
    const health = await checkMonitoringHealth();
    
    // Determine HTTP status based on health
    const status = health.isHealthy ? 200 : 503; // 503 Service Unavailable
    
    res.status(status).json({
      status: health.isHealthy ? 'ok' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: Math.round((Date.now() - new Date(health.startTime).getTime()) / 1000),
      details: health
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
}); 