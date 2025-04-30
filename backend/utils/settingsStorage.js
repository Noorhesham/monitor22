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
