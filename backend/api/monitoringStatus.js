// monitoringStatus.js
import express from 'express';
import cors from 'cors';
import { HeaderMonitorService } from '../services/headerMonitorService.js';
import { HeaderSettingsService } from '../services/headerSettingsService.js';
import { sendAlertNotifications } from '../utils/notifications.js';
import { initDatabase } from '../database/db.js';

const router = express.Router();

// Make sure database is initialized
try {
  await initDatabase();
} catch (error) {
  console.error('Failed to initialize database in monitoringStatus:', error);
}

// Configure CORS options
const corsOptions = {
  origin: ['http://localhost:3000', 'http://localhost:5173'], // Allow both default Vite and CRA ports
  methods: ['GET'],
  credentials: true,
  optionsSuccessStatus: 204
};

// In-memory cache of the latest monitoring data
let monitoringCache = {
  headerValues: {},
  alerts: [],
  lastUpdated: null
};

// Update the cache with new monitoring data
export async function updateMonitoringCache(headerValues, alerts) {
  const now = new Date();
  
  // Update in-memory cache
  monitoringCache = {
    headerValues,
    alerts,
    lastUpdated: now
  };

  try {
    // Send notifications for new alerts
    await sendAlertNotifications(alerts);
  } catch (error) {
    console.error('Error sending notifications:', error);
  }
}

// Background monitoring task
async function runMonitoring() {
  try {
    const { headerValues, alerts } = await HeaderMonitorService.monitorAllHeaders();
    await updateMonitoringCache(headerValues, alerts);
  } catch (error) {
    console.error('Error in monitoring cycle:', error);
  }
}

// Start background monitoring
const MONITORING_INTERVAL = 5000; // 5 seconds
// setInterval(runMonitoring, MONITORING_INTERVAL);
// runMonitoring(); // Run initial monitoring

// API endpoint to get current monitoring status
router.get('/', cors(corsOptions), (req, res) => {
  res.json({
    ...monitoringCache,
    timestamp: Date.now()
  });
});

export default router; 