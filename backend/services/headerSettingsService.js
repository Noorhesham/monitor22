import { getDb } from '../database/db.js';

export class HeaderSettingsService {
  /**
   * Get header settings for a project
   */
  static async getProjectHeaderSettings(projectId) {
    try {
      const database = await getDb();
      const settings = await database.all(`
        SELECT 
          id,
          project_id,
          header_id,
          header_name,
          threshold,
          alert_duration,
          frozen_threshold,
          is_monitored,
          last_value,
          last_update,
          alert_state,
          created_at,
          first_exceeded_time,
          updated_at
        FROM project_header_settings 
        WHERE project_id = ?
      `, [projectId]);
      
      console.log(`Retrieved ${settings.length} header settings for project ${projectId}`);
      return settings;
    } catch (error) {
      console.error('Error getting project header settings:', error);
      return [];
    }
  }

  /**
   * Update or insert header settings
   */
  static async upsertHeaderSettings(projectId, headerData) {
    try {
      const database = await getDb();
      if (!database) {
        throw new Error('Database connection not initialized');
      }
      // Check if project exists in active_projects
      const project = await database.get('SELECT project_id FROM active_projects WHERE project_id = ? AND is_deleted = 0', [projectId]);
      if (!project) {
        console.warn(`Project ${projectId} not found or is marked as deleted. Cannot upsert header settings.`);
        return false;
      }

      // Now run the upsert using the awaited database object
      await database.run(`
        INSERT INTO project_header_settings (
          project_id, header_id, header_name, threshold,
          alert_duration, frozen_threshold, is_monitored, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(project_id, header_id) DO UPDATE SET
          header_name = excluded.header_name,
          threshold = excluded.threshold,
          alert_duration = excluded.alert_duration,
          frozen_threshold = excluded.frozen_threshold,
          is_monitored = excluded.is_monitored,
          updated_at = CURRENT_TIMESTAMP
      `, [
        projectId,
        headerData.id,
        headerData.name,
        headerData.threshold,
        headerData.alertDuration || null,
        headerData.frozenThreshold || null,
        headerData.isMonitored ? 1 : 0
      ]);

      console.log(`Successfully upserted header ${headerData.id} for project ${projectId}`);
      return true;
    } catch (error) {
      console.error('Error upserting header settings:', error);
      return false;
    }
  }

  /**
   * Update header value and alert state
   * This keeps the existing last_update timestamp unless explicitly told to update it
   */
  static async updateHeaderValue(projectId, headerId, value, alertState = null) {
    try {
      const database = await getDb();
      if (!database) {
        throw new Error('Database connection not initialized');
      }

      // First, check if the value has actually changed
      const currentRecord = await database.get(
        'SELECT last_value FROM project_header_settings WHERE project_id = ? AND header_id = ?',
        [projectId, headerId]
      );

      // Only update the last_value, keep the same last_update timestamp
      await database.run(`
        UPDATE project_header_settings 
        SET last_value = ?,
            alert_state = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE project_id = ? AND header_id = ?
      `, [value, alertState, projectId, headerId]);
      
      return true;
    } catch (error) {
      console.error('Error updating header value:', error);
      return false;
    }
  }

  /**
   * Update header value, state, but not timestamp
   */
  static async updateHeaderValueAndState(projectId, headerId, value, state, alertState = null) {
    try {
      const database = await getDb();
      if (!database) {
        throw new Error('Database connection not initialized');
      }

      // Update value and state but not timestamp
      await database.run(`
        UPDATE project_header_settings 
        SET last_value = ?,
            state = ?,
            alert_state = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE project_id = ? AND header_id = ?
      `, [value, state, alertState, projectId, headerId]);
      
      return true;
    } catch (error) {
      console.error('Error updating header value and state:', error);
      return false;
    }
  }

  /**
   * Update header value, alert state AND last_update timestamp
   * This should be used when you want to explicitly update the timestamp
   */
  static async updateHeaderValueWithTimestamp(projectId, headerId, value, alertState = null) {
    try {
      const database = await getDb();
      if (!database) {
        throw new Error('Database connection not initialized');
      }

      await database.run(`
        UPDATE project_header_settings 
        SET last_value = ?,
            last_update = CURRENT_TIMESTAMP,
            alert_state = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE project_id = ? AND header_id = ?
      `, [value, alertState, projectId, headerId]);
      
      return true;
    } catch (error) {
      console.error('Error updating header value with timestamp:', error);
      return false;
    }
  }

  /**
   * Update header value, state, AND last_update timestamp
   * @param {number} projectId - The project ID
   * @param {number} headerId - The header ID  
   * @param {number|string} value - The header value
   * @param {string} state - The header state
   * @param {string|null} timestamp - Optional ISO timestamp string to use instead of current time
   * @param {string|null} alertState - Optional alert state
   */
  static async updateHeaderValueWithTimestampAndState(projectId, headerId, value, state, timestamp = null, alertState = null) {
    try {
      const database = await getDb();
      if (!database) {
        throw new Error('Database connection not initialized');
      }

      // Use provided timestamp or current timestamp
      const timestampToUse = timestamp || new Date().toISOString();
      
      console.log(`Updating header ${headerId} with value ${value}, state ${state}, timestamp ${timestampToUse}`);

      await database.run(`
        UPDATE project_header_settings 
        SET last_value = ?,
            state = ?,
            last_update = ?,
            alert_state = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE project_id = ? AND header_id = ?
      `, [value, state, timestampToUse, alertState, projectId, headerId]);
      
      return true;
    } catch (error) {
      console.error('Error updating header value with timestamp and state:', error);
      return false;
    }
  }

  /**
   * Get all monitored headers
   */
  static async getAllMonitoredHeaders() {
    try {
      const database = await getDb();
      if (!database) {
        throw new Error('Database connection not initialized');
      }
      
      // Use a simpler query that doesn't rely on join until we know the tables are populated
      const headers = await database.all(`
        SELECT * FROM project_header_settings
        WHERE is_monitored = TRUE
      `);
      
      console.log(`Retrieved ${headers.length} monitored headers`);
      return headers;
    } catch (error) {
      console.error('Error getting monitored headers:', error);
      return [];
    }
  }

  /**
   * Remove header from monitoring
   */
  static async removeHeaderMonitoring(projectId, headerId) {
    try {
      const database = await getDb();
      await database.run(`
        UPDATE project_header_settings 
        SET is_monitored = FALSE,
            updated_at = CURRENT_TIMESTAMP
        WHERE project_id = ? AND header_id = ?
      `, [projectId, headerId]);
      
      return true;
    } catch (error) {
      console.error('Error removing header monitoring:', error);
      return false;
    }
  }

  /**
   * Clean up old header settings
   */
  static async cleanupOldSettings() {
    try {
      const database = await getDb();
      // Remove settings for deleted projects
      await database.run(`
        DELETE FROM project_header_settings
        WHERE project_id IN (
          SELECT project_id FROM active_projects
          WHERE is_deleted = TRUE
          OR last_active_at < datetime('now', '-7 days')
        )
      `);
      
      return true;
    } catch (error) {
      console.error('Error cleaning up old header settings:', error);
      return false;
    }
  }
} 