// Database schema definitions
const SCHEMA = {
  // Settings table
  settings: `
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY,
      settings_json TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `,

  // Header thresholds table
  header_thresholds: `
    CREATE TABLE IF NOT EXISTS header_thresholds (
      id INTEGER PRIMARY KEY,
      thresholds_json TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `,

  // Active projects tracking
  active_projects: `
    CREATE TABLE IF NOT EXISTS active_projects (
      project_id INTEGER PRIMARY KEY,
      company_id INTEGER NOT NULL,
      company_name TEXT NOT NULL,
      company_short_name TEXT,
      project_name TEXT NOT NULL,
      stage_name TEXT NOT NULL,
      well_number TEXT,
      last_active_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      is_deleted BOOLEAN DEFAULT FALSE
    )
  `,

  // Project header monitoring settings
  project_header_settings: `
    CREATE TABLE IF NOT EXISTS project_header_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      header_id TEXT NOT NULL,
      header_name TEXT NOT NULL,
      header_type TEXT,
      threshold REAL,
      alert_duration INTEGER,
      frozen_threshold INTEGER,
      is_monitored BOOLEAN DEFAULT FALSE,
      last_value REAL,
      last_update TIMESTAMP,
      alert_state TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES active_projects (project_id),
      UNIQUE (project_id, header_id)
    )
  `,

  // Monitoring cache table
  monitor_cache: `
    CREATE TABLE IF NOT EXISTS monitor_cache (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `,

  // Indexes
  indexes: [
    'CREATE INDEX IF NOT EXISTS idx_active_projects_last_active ON active_projects(last_active_at)',
    'CREATE INDEX IF NOT EXISTS idx_project_header_settings_project ON project_header_settings(project_id)',
    'CREATE INDEX IF NOT EXISTS idx_project_header_settings_header ON project_header_settings(header_id)',
    'CREATE INDEX IF NOT EXISTS idx_project_header_settings_monitored ON project_header_settings(is_monitored)',
    'CREATE INDEX IF NOT EXISTS idx_monitor_cache_last_updated ON monitor_cache(last_updated)',
    'CREATE INDEX IF NOT EXISTS idx_settings_updated_at ON settings(updated_at)',
    'CREATE INDEX IF NOT EXISTS idx_header_thresholds_updated_at ON header_thresholds(updated_at)'
  ]
};

export { SCHEMA }; 