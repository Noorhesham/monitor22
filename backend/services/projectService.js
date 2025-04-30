import { getDb } from '../database/db.js';

export class ProjectService {
  /**
   * Update or insert an active project
   */
  static async upsertActiveProject(projectData) {
    const { projectId, companyId, companyName, companyShortName, projectName } = projectData;
    
    try {
      const db = await getDb();
      await db.run(`
        INSERT INTO active_projects (
          project_id, company_id, company_name, company_short_name, project_name, last_active_at
        ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(project_id) DO UPDATE SET
          company_name = excluded.company_name,
          company_short_name = excluded.company_short_name,
          project_name = excluded.project_name,
          last_active_at = CURRENT_TIMESTAMP,
          is_deleted = FALSE
      `, [projectId, companyId, companyName, companyShortName, projectName]);
      
      return true;
    } catch (error) {
      console.error('Error upserting active project:', error);
      return false;
    }
  }

  /**
   * Get all active projects
   */
  static async getActiveProjects() {
    try {
      const db = await getDb();
      const projects = await db.all(`
        SELECT * FROM active_projects 
        WHERE is_deleted = FALSE 
        AND last_active_at > datetime('now', '-7 days')
        ORDER BY last_active_at DESC
      `);
      return projects;
    } catch (error) {
      console.error('Error getting active projects:', error);
      return [];
    }
  }

  /**
   * Delete a project (soft delete)
   */
  static async deleteProject(projectId) {
    try {
      const db = await getDb();
      await db.run(`
        UPDATE active_projects 
        SET is_deleted = TRUE 
        WHERE project_id = ?
      `, [projectId]);
      return true;
    } catch (error) {
      console.error('Error deleting project:', error);
      return false;
    }
  }

  /**
   * Update header settings for a project
   */
  static async updateProjectHeaderSettings(projectId, headerSettings) {
    try {
      // Start a transaction
      const db = await getDb();
      await db.run('BEGIN TRANSACTION');

      for (const header of headerSettings) {
        await db.run(`
          INSERT INTO project_header_settings (
            project_id, header_id, header_name, threshold, 
            alert_duration, frozen_threshold, is_monitored, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(project_id, header_id) DO UPDATE SET
            threshold = excluded.threshold,
            alert_duration = excluded.alert_duration,
            frozen_threshold = excluded.frozen_threshold,
            is_monitored = excluded.is_monitored,
            updated_at = CURRENT_TIMESTAMP
        `, [
          projectId, 
          header.id, 
          header.name, 
          header.threshold,
          header.alertDuration || null,
          header.frozenThreshold || null,
          header.isMonitored ? 1 : 0
        ]);
      }

      await db.run('COMMIT');
      return true;
    } catch (error) {
      const db = await getDb();
      await db.run('ROLLBACK');
      console.error('Error updating project header settings:', error);
      return false;
    }
  }

  /**
   * Get header settings for a project
   */
  static async getProjectHeaderSettings(projectId) {
    try {
      const db = await getDb();
      const settings = await db.all(`
        SELECT * FROM project_header_settings 
        WHERE project_id = ? 
        AND is_monitored = TRUE
      `, [projectId]);
      return settings;
    } catch (error) {
      console.error('Error getting project header settings:', error);
      return [];
    }
  }

  /**
   * Clean up old projects
   */
  static async cleanupOldProjects() {
    try {
      const db = await getDb();
      await db.run(`
        UPDATE active_projects 
        SET is_deleted = TRUE 
        WHERE last_active_at < datetime('now', '-7 days')
      `);
      return true;
    } catch (error) {
      console.error('Error cleaning up old projects:', error);
      return false;
    }
  }
} 