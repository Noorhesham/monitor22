/**
 * Enhanced database service with improved error handling and connection management
 */
class DatabaseService {
  constructor() {
    this.db = null;
    this.isInitializing = false;
    this.initPromise = null;
    this.lastError = null;
    this.connectionAttempts = 0;
    this.maxConnectionAttempts = 5;
    this.connectionBackoff = 1000; // ms
    this.schemaVersion = "1.0"; // Current schema version
  }

  /**
   * Get database connection with enhanced error handling and connection reuse
   * @returns {Promise<Object>} - SQLite database connection
   */
  async getDb() {
    // If we already have a valid connection, return it
    if (this.db) {
      try {
        // Quick test query to verify connection is still valid
        await this.db.get("SELECT 1");
        return this.db;
      } catch (error) {
        console.error("Database connection test failed, will reinitialize:", error);
        this.db = null;
        this.lastError = error;
      }
    }

    // If initialization is in progress, wait for it
    if (this.isInitializing) {
      return this.initPromise;
    }

    // Start initialization
    this.isInitializing = true;
    this.connectionAttempts += 1;

    this.initPromise = new Promise(async (resolve, reject) => {
      try {
        console.log("Initializing database connection...");

        // Get database path from config or use default
        const dbPath = process.env.DB_PATH || path.join(__dirname, "../data/monitoring.db");
        const dbDir = path.dirname(dbPath);

        // Ensure database directory exists
        if (!fs.existsSync(dbDir)) {
          console.log(`Creating database directory: ${dbDir}`);
          fs.mkdirSync(dbDir, { recursive: true });
        }

        // Initialize database connection
        const newDb = await sqlite.open({
          filename: dbPath,
          driver: sqlite3.Database,
        });

        console.log(`Connected to database at ${dbPath}`);

        // Verify database schema
        await this.verifyDatabaseSchema(newDb);

        // Reset connection attempts on success
        this.connectionAttempts = 0;
        this.lastError = null;
        this.db = newDb;

        resolve(this.db);
      } catch (error) {
        this.lastError = error;
        console.error("Database initialization failed:", error);

        // Implement retry with exponential backoff if under max attempts
        if (this.connectionAttempts < this.maxConnectionAttempts) {
          const backoffTime = this.connectionBackoff * Math.pow(2, this.connectionAttempts - 1);
          console.log(
            `Retrying database connection in ${backoffTime}ms (attempt ${this.connectionAttempts} of ${this.maxConnectionAttempts})`
          );

          setTimeout(() => {
            this.isInitializing = false;
            this.getDb().then(resolve).catch(reject);
          }, backoffTime);
        } else {
          console.error(`Maximum database connection attempts (${this.maxConnectionAttempts}) reached. Giving up.`);
          reject(error);
        }
      } finally {
        this.isInitializing = false;
      }
    });

    return this.initPromise;
  }

  /**
   * Verify and upgrade database schema if needed
   * @param {Object} db - Database connection
   * @returns {Promise<boolean>} - Success status
   */
  async verifyDatabaseSchema(db) {
    try {
      console.log("Verifying database schema...");

      // Check if schema version table exists
      const hasVersionTable = await db.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'"
      );

      // Create schema version table if it doesn't exist
      if (!hasVersionTable) {
        console.log("Creating schema version table");
        await db.exec(`
          CREATE TABLE schema_version (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            version TEXT NOT NULL,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        await db.run("INSERT INTO schema_version (version) VALUES (?)", [this.schemaVersion]);
      }

      // Get current schema version
      const versionRecord = await db.get("SELECT version FROM schema_version ORDER BY id DESC LIMIT 1");
      const currentVersion = versionRecord ? versionRecord.version : "0";
      console.log(`Current database schema version: ${currentVersion}`);

      // Check if upgrade is needed
      if (currentVersion !== this.schemaVersion) {
        console.log(`Database schema upgrade needed: ${currentVersion} -> ${this.schemaVersion}`);
        await this.upgradeDatabaseSchema(db, currentVersion);
      }

      // Create required tables if they don't exist
      await this.createTablesIfNeeded(db);

      return true;
    } catch (error) {
      console.error("Schema verification failed:", error);
      throw error;
    }
  }

  /**
   * Upgrade database schema to latest version
   * @param {Object} db - Database connection
   * @param {string} currentVersion - Current schema version
   * @returns {Promise<boolean>} - Success status
   */
  async upgradeDatabaseSchema(db, currentVersion) {
    try {
      console.log(`Upgrading database schema from ${currentVersion} to ${this.schemaVersion}`);

      // Begin transaction for schema upgrade
      await db.exec("BEGIN TRANSACTION");

      // Apply schema updates based on current version
      switch (currentVersion) {
        case "0":
          // Initial schema creation will be handled by createTablesIfNeeded
          break;

        // Add future migration paths here
        case "0.9":
          // Example: Upgrade from 0.9 to 1.0
          console.log("Upgrading schema from 0.9 to 1.0");
          // Add any specific migration SQL here
          break;

        default:
          console.warn(`Unknown schema version: ${currentVersion}. Attempting to recreate tables.`);
      }

      // Update schema version
      await db.run("INSERT INTO schema_version (version) VALUES (?)", [this.schemaVersion]);

      // Commit transaction
      await db.exec("COMMIT");

      console.log(`Schema upgrade completed to version ${this.schemaVersion}`);
      return true;
    } catch (error) {
      // Rollback transaction on error
      try {
        await db.exec("ROLLBACK");
      } catch (rollbackError) {
        console.error("Failed to rollback schema upgrade transaction:", rollbackError);
      }

      console.error("Schema upgrade failed:", error);
      throw error;
    }
  }

  /**
   * Create all required database tables if they don't exist
   * @param {Object} db - Database connection
   * @returns {Promise<boolean>} - Success status
   */
  async createTablesIfNeeded(db) {
    try {
      console.log("Ensuring all required tables exist...");

      // Create settings table
      await db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          value TEXT,
          last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create thresholds table
      await db.exec(`
        CREATE TABLE IF NOT EXISTS thresholds (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          value REAL NOT NULL,
          description TEXT,
          last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create project_headers table
      await db.exec(`
        CREATE TABLE IF NOT EXISTS project_headers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id TEXT NOT NULL,
          header_id TEXT NOT NULL,
          is_monitored BOOLEAN DEFAULT 1,
          first_exceeded_time TIMESTAMP,
          
          last_value_time TIMESTAMP,
          last_frozen_alert_time TIMESTAMP,
          last_alert_time TIMESTAMP,
          last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(project_id, header_id)
        )
      `);

      // Create project_header_settings table
      await db.exec(`
        CREATE TABLE IF NOT EXISTS project_header_settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          first_exceeded_time TIMESTAMP,
          project_id TEXT NOT NULL,
          last_frozen_alert_time TIMESTAMP,
          last_alert_time TIMESTAMP,
          header_id TEXT NOT NULL,
          threshold_name TEXT NOT NULL,
          threshold_value REAL,
          threshold_override BOOLEAN DEFAULT 0,
          last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(project_id, header_id, threshold_name)
        )
      `);

      // Create monitoring_logs table
      await db.exec(`
        CREATE TABLE IF NOT EXISTS monitoring_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id TEXT NOT NULL,
          header_id TEXT NOT NULL,
          value REAL,
          threshold REAL,
          threshold_name TEXT,
          status TEXT CHECK(status IN ('ok', 'alert', 'frozen')),
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create alert_history table
      await db.exec(`
        CREATE TABLE IF NOT EXISTS alert_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id TEXT NOT NULL,
          header_id TEXT NOT NULL,
          alert_type TEXT NOT NULL,
          value REAL,
          threshold REAL,
          threshold_name TEXT,
          triggered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          resolved_at TIMESTAMP,
          notification_sent BOOLEAN DEFAULT 0
        )
      `);

      // Create indexes for performance
      await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_project_header ON project_headers(project_id, header_id);
        CREATE INDEX IF NOT EXISTS idx_alert_history_unresolved ON alert_history(project_id, header_id, resolved_at) 
          WHERE resolved_at IS NULL;
        CREATE INDEX IF NOT EXISTS idx_monitoring_logs_recent ON monitoring_logs(project_id, header_id, timestamp);
      `);

      console.log("All required tables and indexes created successfully");
      return true;
    } catch (error) {
      console.error("Failed to create database tables:", error);
      throw error;
    }
  }

  /**
   * Close database connection gracefully
   * @returns {Promise<boolean>} - Success status
   */
  async closeDb() {
    if (this.db) {
      try {
        await this.db.close();
        console.log("Database connection closed successfully");
        this.db = null;
        return true;
      } catch (error) {
        console.error("Error closing database connection:", error);
        throw error;
      }
    }
    return true;
  }

  /**
   * Get current database health status
   * @returns {Object} - Database status
   */
  getStatus() {
    return {
      connected: !!this.db,
      lastError: this.lastError ? this.lastError.message : null,
      connectionAttempts: this.connectionAttempts,
      schemaVersion: this.schemaVersion,
    };
  }
}

module.exports = new DatabaseService();
