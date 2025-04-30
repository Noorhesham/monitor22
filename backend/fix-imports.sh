#!/bin/bash
# Script to fix import paths in the backend codebase

echo "Fixing import paths in backend files..."

# Fix app.js directly by recreating it
echo "Fixing app.js..."
cat > app.js << 'EOF'
import express from 'express';
import cors from 'cors';
import { initDatabase } from './database/db.js';
import { router as monitoringRoutes } from './routes/monitoring.js';
import { router as projectsRoutes } from './routes/projects.js';
import settingsRouter from './api/settings.js';
import projectRouter from './api/project.js';

// Get port from environment variable
const PORT = process.env.MONITOR_API_PORT || 3002;

// Initialize database
console.log('Initializing database...');
try {
  await initDatabase();
  console.log('Database initialized');
} catch (error) {
  console.error('Failed to initialize database:', error);
  process.exit(1);
}

const app = express();

// == Apply CORS middleware globally BEFORE any routes ==
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Ensure OPTIONS is included
  allowedHeaders: ['Content-Type', 'Authorization'] // Ensure necessary headers are allowed
};
app.use(cors(corsOptions));

// Handle OPTIONS requests explicitly for all routes (sometimes needed)
app.options('*', cors(corsOptions));

// Parse JSON bodies
app.use(express.json());

// Root level status check
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Backend monitoring service is running' });
});

// Register routes
console.log('Registering route: /status -> monitoringRoutes');
app.use('/status', monitoringRoutes);
console.log('Registering route: /api/monitoring -> monitoringRoutes');
app.use('/api/monitoring', monitoringRoutes);
console.log('Registering route: /api/projects -> projectsRoutes');
app.use('/api/projects', projectsRoutes);
console.log('Registering route: /api/settings -> settingsRouter');
app.use('/api/settings', settingsRouter);
console.log('Registering route: /api/settings/project -> projectRouter');
app.use('/api/settings/project', projectRouter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

export default app;
EOF

# Fix paths in api/project.js
echo "Fixing api/project.js..."
cat > api/project.js << 'EOF'
import express from 'express';
import { ProjectService } from '../services/projectService.js';
import { HeaderSettingsService } from '../services/headerSettingsService.js';
import { updateMonitoredItems } from '../monitorService.js';

const router = express.Router();

// GET /api/settings/project/:projectId/headers
router.get('/:projectId/headers', async (req, res) => {
  try {
    const { projectId } = req.params;
    
    if (!projectId) {
      return res.status(400).json({ error: 'Project ID is required' });
    }
    
    const settings = await ProjectService.getProjectHeaderSettings(projectId);
    return res.json({ headers: settings });
  } catch (error) {
    console.error(`Error getting header settings for project ${req.params.projectId}:`, error);
    return res.status(500).json({ error: 'Failed to get project header settings' });
  }
});

// POST /api/settings/project/:projectId/headers
router.post('/:projectId/headers', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { headers } = req.body;
    
    if (!projectId) {
      return res.status(400).json({ error: 'Project ID is required' });
    }
    
    if (!headers || !Array.isArray(headers)) {
      return res.status(400).json({ error: 'Headers array is required' });
    }
    
    // First, ensure the project exists
    const projectExists = await ProjectService.upsertActiveProject({
      projectId: parseInt(projectId, 10),
      companyId: headers[0]?.companyId || 0,
      companyName: headers[0]?.companyName || 'Unknown',
      projectName: headers[0]?.projectName || 'Unknown Project'
    });
    
    if (!projectExists) {
      return res.status(500).json({ error: 'Failed to create/update project' });
    }
    
    // Then update all header settings in a transaction
    const success = await Promise.all(headers.map(header => {
      return HeaderSettingsService.upsertHeaderSettings(projectId, {
        headerId: header.header_id,
        headerName: header.header_name || 'Unknown Header',
        threshold: header.threshold,
        alertDuration: header.alert_duration || 20,
        frozenThreshold: header.frozen_threshold || 120,
        isMonitored: header.is_monitored
      });
    }));
    
    // If all updates were successful
    if (!success.includes(false)) {
      // Trigger update of monitored items
      updateMonitoredItems();
      
      return res.json({ 
        success: true, 
        message: `Updated ${headers.length} header settings for project ${projectId}` 
      });
    } else {
      return res.status(500).json({ 
        error: 'Some header settings failed to update',
        details: success
      });
    }
  } catch (error) {
    console.error(`Error updating header settings for project ${req.params.projectId}:`, error);
    return res.status(500).json({ error: 'Failed to update project header settings' });
  }
});

// Update individual header setting
router.post('/header-setting/:headerId', async (req, res) => {
  try {
    const { headerId } = req.params;
    const settings = req.body;

    await HeaderSettingsService.setHeaderSettings(headerId, {
      threshold: settings.threshold,
      alertDuration: settings.alertDuration,
      frozenThreshold: settings.frozenThreshold,
      isMonitored: settings.isMonitored
    });

    res.json({ success: true, message: 'Header settings updated' });
  } catch (error) {
    console.error('Error updating header settings:', error);
    res.status(500).json({ error: 'Failed to update header settings' });
  }
});

export default router;
EOF

echo "Creating settingsStorage.js if it doesn't exist..."
mkdir -p utils
cat > utils/settingsStorage.js << 'EOF'
/**
 * Settings storage utility functions
 */
import { getDb } from '../database/db.js';

/**
 * Load settings from the database
 * @returns {Promise<Object>} The settings object
 */
export async function loadSettings() {
  try {
    const db = await getDb();
    const result = await db.get('SELECT * FROM settings WHERE id = 1');
    
    if (!result) {
      // Create default settings
      const defaultSettings = {
        pollingInterval: 5,
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
        version: 1
      };
      
      // Store default settings
      await db.run(
        'INSERT INTO settings (id, settings_json) VALUES (?, ?)',
        [1, JSON.stringify(defaultSettings)]
      );
      
      return defaultSettings;
    }
    
    // Parse settings from JSON
    return JSON.parse(result.settings_json);
  } catch (error) {
    console.error('Error loading settings:', error);
    return null;
  }
}

/**
 * Load header thresholds from the database
 * @returns {Promise<Object>} The header thresholds object
 */
export async function loadHeaderThresholds() {
  try {
    const db = await getDb();
    const result = await db.get('SELECT * FROM header_thresholds WHERE id = 1');
    
    if (!result) {
      // Create default thresholds
      const defaultThresholds = {
        thresholds: {},
        headerSettings: {},
        lastUpdated: new Date().toISOString(),
        version: 1
      };
      
      // Store default thresholds
      await db.run(
        'INSERT INTO header_thresholds (id, thresholds_json) VALUES (?, ?)',
        [1, JSON.stringify(defaultThresholds)]
      );
      
      return defaultThresholds;
    }
    
    // Parse thresholds from JSON
    return JSON.parse(result.thresholds_json);
  } catch (error) {
    console.error('Error loading header thresholds:', error);
    return null;
  }
}

/**
 * Save settings to the database
 * @param {Object} settings The settings object to save
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
export async function saveSettings(settings) {
  try {
    const db = await getDb();
    await db.run(
      'INSERT OR REPLACE INTO settings (id, settings_json) VALUES (?, ?)',
      [1, JSON.stringify(settings)]
    );
    return true;
  } catch (error) {
    console.error('Error saving settings:', error);
    return false;
  }
}

/**
 * Save header thresholds to the database
 * @param {Object} thresholds The header thresholds object to save
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
export async function saveHeaderThresholds(thresholds) {
  try {
    const db = await getDb();
    await db.run(
      'INSERT OR REPLACE INTO header_thresholds (id, thresholds_json) VALUES (?, ?)',
      [1, JSON.stringify(thresholds)]
    );
    return true;
  } catch (error) {
    console.error('Error saving header thresholds:', error);
    return false;
  }
}
EOF

echo "Import paths fixed successfully!" 