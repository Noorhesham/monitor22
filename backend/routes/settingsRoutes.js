import express from 'express';
import { getDb } from '../database/db.js';

const router = express.Router();

// Get global settings
router.get('/global', async (req, res) => {
  try {
    const db = await getDb();
    const result = await db.get('SELECT settings_json FROM settings WHERE id = 1');
    
    // If no settings found, return default settings
    if (!result) {
      const defaultSettings = {
        pollingInterval: 60, // seconds
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
        }
      };
      
      // Store default settings
      await db.run(
        'INSERT INTO settings (id, settings_json) VALUES (?, ?)',
        [1, JSON.stringify(defaultSettings)]
      );
      
      return res.json(defaultSettings);
    }
    
    return res.json(JSON.parse(result.settings_json));
  } catch (error) {
    console.error('Error fetching global settings:', error);
    return res.status(500).json({ error: 'Failed to fetch global settings' });
  }
});

// Update global settings
router.post('/global', async (req, res) => {
  try {
    const settings = req.body;
    
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'Settings object is required' });
    }
    
    const db = await getDb();
    
    // Get current settings
    const currentResult = await db.get('SELECT settings_json FROM settings WHERE id = 1');
    let currentSettings = currentResult ? JSON.parse(currentResult.settings_json) : null;
    
    // If no current settings, use defaults
    if (!currentSettings) {
      currentSettings = {
        pollingInterval: 60,
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
        }
      };
    }
    
    // Merge new settings with current settings
    const updatedSettings = {
      ...currentSettings,
      ...settings,
      patternCategories: {
        ...currentSettings.patternCategories,
        ...(settings.patternCategories || {})
      }
    };
    
    // Validate numeric values
    if (typeof updatedSettings.pollingInterval === 'number' && updatedSettings.pollingInterval < 10) {
      return res.status(400).json({ error: 'Polling interval must be at least 10 seconds' });
    }
    
    // Save updated settings
    await db.run(
      'INSERT OR REPLACE INTO settings (id, settings_json) VALUES (?, ?)',
      [1, JSON.stringify(updatedSettings)]
    );
    
    return res.json(updatedSettings);
  } catch (error) {
    console.error('Error updating global settings:', error);
    return res.status(500).json({ error: 'Failed to update global settings' });
  }
});

export { router }; 