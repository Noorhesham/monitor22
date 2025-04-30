import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database file path
const DB_PATH = path.resolve(__dirname, '../private/db/monitor.db');
console.log('Initializing database at', DB_PATH);

// Database connection instance
let db = null;
let schemaVersion = 1; // Current schema version

// Validate database schema 
export const validateSchema = async (dbInstance) => {
  try {
    console.log('Validating database schema...');
    
    // Check required tables
    const requiredTables = [
      'settings', 
      'header_thresholds', 
      'active_projects', 
      'project_header_settings', 
      'monitor_cache', 
      'alerts', 
      'alert_snoozes'
    ];
    
    // Get list of actual tables
    const tables = await dbInstance.all(`SELECT name FROM sqlite_master WHERE type='table'`);
    const tableNames = tables.map(t => t.name);
    
    // Check if all required tables exist
    const missingTables = requiredTables.filter(t => !tableNames.includes(t));
    
    if (missingTables.length > 0) {
      console.error(`Database schema validation failed: Missing tables: ${missingTables.join(', ')}`);
      return false;
    }
    
    // Advanced validation: check for specific columns in critical tables
    const projectHeaderColumns = await dbInstance.all(`PRAGMA table_info(project_header_settings)`);
    const columnNames = projectHeaderColumns.map(c => c.name);
    
    // Check for the most critical columns
    const requiredColumns = ['project_id', 'header_id', 'header_name', 'state', 'is_monitored'];
    const missingColumns = requiredColumns.filter(c => !columnNames.includes(c));
    
    if (missingColumns.length > 0) {
      console.error(`Database schema validation failed: Missing columns in project_header_settings: ${missingColumns.join(', ')}`);
      return false;
    }
    
    console.log('Database schema validation successful');
    return true;
  } catch (error) {
    console.error('Error validating database schema:', error);
    return false;
  }
};

// Initialize the database
export const initDatabase = async () => {
  try {
    // Create private/db directory if it doesn't exist
    const dbDir = path.dirname(DB_PATH);
    await import('fs').then(fs => fs.promises.mkdir(dbDir, { recursive: true }));
    
    // Open the database connection
    db = await open({
      filename: DB_PATH,
      driver: sqlite3.Database
    });
    
    // Create necessary tables if they don't exist
    await db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY,
        settings_json TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Created table if not exists: settings');
    
    await db.exec(`
      CREATE TABLE IF NOT EXISTS header_thresholds (
        id INTEGER PRIMARY KEY,
        thresholds_json TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Created table if not exists: header_thresholds');
    
    await db.exec(`
      CREATE TABLE IF NOT EXISTS active_projects (
        project_id INTEGER PRIMARY KEY,
        company_id INTEGER NULL,
        company_name TEXT DEFAULT 'Unknown Company',
        company_short_name TEXT,
        project_name TEXT NOT NULL,
        stage_id TEXT NULL,
        last_active_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_deleted BOOLEAN DEFAULT FALSE
      )
    `);
    console.log('Created table if not exists: active_projects');
    
    await db.exec(`
      CREATE TABLE IF NOT EXISTS project_header_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        header_id TEXT NOT NULL,
        header_name TEXT NOT NULL,
        threshold REAL,
        alert_duration INTEGER,
        frozen_threshold INTEGER,
        is_monitored BOOLEAN DEFAULT TRUE,
        last_value REAL,
        last_update TIMESTAMP,
        alert_state TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES active_projects (project_id),
        UNIQUE (project_id, header_id)
      )
    `);
    console.log('Created table if not exists: project_header_settings');
    
    await db.exec(`
      CREATE TABLE IF NOT EXISTS monitor_cache (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Created table if not exists: monitor_cache');
    
    await db.exec(`
      CREATE TABLE IF NOT EXISTS alerts (
        id TEXT PRIMARY KEY,
        type TEXT,
        header_id TEXT,
        header_name TEXT,
        value REAL,
        threshold REAL,
        timestamp TIMESTAMP,
        project_id TEXT,
        company_id TEXT,
        stage_id TEXT,
        dismissed INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Created table if not exists: alerts');
    
    await db.exec(`
      CREATE TABLE IF NOT EXISTS alert_snoozes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        alert_id TEXT,
        snooze_until TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(alert_id)
      )
    `);
    console.log('Created table if not exists: alert_snoozes');
    
    // Consider adding indices for performance if not already present implicitly
    await db.exec('CREATE INDEX IF NOT EXISTS idx_project_header_settings_project_id ON project_header_settings (project_id);');
    await db.exec('CREATE INDEX IF NOT EXISTS idx_project_header_settings_header_id ON project_header_settings (header_id);');
    await db.exec('CREATE INDEX IF NOT EXISTS idx_alerts_header_id ON alerts(header_id);');
    await db.exec('CREATE INDEX IF NOT EXISTS idx_alerts_project_id ON alerts(project_id);');
    await db.exec('CREATE INDEX IF NOT EXISTS idx_alert_snoozes_alert_id ON alert_snoozes(alert_id);');
    await db.exec('CREATE INDEX IF NOT EXISTS idx_alert_snoozes_snooze_until ON alert_snoozes(snooze_until);');
    console.log('Created indexes if not exist');

    // Add state column to project_header_settings table
    await db.run(`
      ALTER TABLE project_header_settings 
      ADD COLUMN state TEXT DEFAULT NULL
    `).catch(err => {
      // Ignore error if column already exists
      if (!err.message.includes('duplicate column name'))
        console.error('Error adding state column:', err);
    });

    console.log('Database schema initialized successfully');
    
    // Validate the schema after initialization
    await validateSchema(db);
    
    return db;
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
};

// Get database connection with retry logic
export const getDb = async (retryCount = 3, retryDelay = 1000) => {
  if (db) {
    try {
      // Simple check to verify connection is still valid
      await db.get('SELECT 1');
      return db;
    } catch (error) {
      console.warn('Database connection test failed, will reinitialize', error);
      db = null; // Reset connection
    }
  }
  
  // Implement retry logic
  for (let attempt = 1; attempt <= retryCount; attempt++) {
    try {
      console.log(`Initializing database connection (attempt ${attempt}/${retryCount})...`);
      db = await initDatabase();
      
      // Validate schema after successful connection
      const isValid = await validateSchema(db);
      if (!isValid) {
        console.error('Database schema validation failed. Attempting to repair...');
        // Force reinitialize to repair schema
        db = null;
        db = await initDatabase();
      }
      
      return db;
    } catch (error) {
      console.error(`Database initialization attempt ${attempt} failed:`, error);
      
      if (attempt < retryCount) {
        console.log(`Retrying in ${retryDelay/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        // Increase delay for next attempt (exponential backoff)
        retryDelay *= 2;
      } else {
        console.error('All database connection attempts failed');
        throw new Error('Failed to establish database connection after multiple attempts');
      }
    }
  }
};

// Close the database connection (optional, useful for graceful shutdown)
export const closeDb = async () => {
  if (db) {
    await db.close();
    db = null;
    console.log('Database connection closed.');
  }
};

export default { getDb, initDatabase, closeDb, validateSchema }; 