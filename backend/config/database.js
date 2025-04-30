import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database file path
const DB_PATH = path.resolve(__dirname, '../private/db/monitor.db');

// Database connection instance
let db = null;

// Initialize the database
export const initDatabase = async () => {
  try {
    console.log('Database connection initialized');
    
    // Open the database connection
    db = await open({
      filename: DB_PATH,
      driver: sqlite3.Database
    });
    
    // Create necessary tables if they don't exist
    await db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        id TEXT PRIMARY KEY,
        data TEXT
      )
    `);
    console.log('Created table if not exists: settings');
    
    await db.exec(`
      CREATE TABLE IF NOT EXISTS header_thresholds (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        warning_threshold REAL,
        alert_threshold REAL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Created table if not exists: header_thresholds');
    
    await db.exec(`
      CREATE TABLE IF NOT EXISTS active_projects (
        id INTEGER PRIMARY KEY,
        stage_id INTEGER,
        stage_name TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Created table if not exists: active_projects');
    
    await db.exec(`
      CREATE TABLE IF NOT EXISTS project_header_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stage_id INTEGER,
        header_id INTEGER,
        warning_threshold REAL,
        alert_threshold REAL,
        is_monitored INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(stage_id, header_id)
      )
    `);
    console.log('Created table if not exists: project_header_settings');
    
    await db.exec(`
      CREATE TABLE IF NOT EXISTS monitor_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cache_key TEXT UNIQUE,
        cache_data TEXT,
        cache_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Created table if not exists: monitor_cache');
    
    console.log('Database schema initialized successfully');
    console.log('Database initialized successfully');
    
    return db;
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
};

// Get the database connection
export const getDb = async () => {
  if (!db) {
    await initDatabase();
  }
  return db;
};

export default { getDb, initDatabase }; 