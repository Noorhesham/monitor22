import express from 'express';
import { getDb } from '../database/db.js';
import axios from 'axios';

const router = express.Router();

// Get active stages and save them to database
router.get('/active/stages', async (req, res) => {
  try {
    const db = await getDb();
    
    // Fetch stages from FracBrain master API
    const response = await axios.get('http://localhost:3002api/active-stages');
    const stages = response.data;

    // Save each stage to the database
    for (const stage of stages) {
      await db.run(`
        INSERT OR REPLACE INTO active_projects (
          project_id,
          company_id,
          company_name,
          company_short_name,
          project_name,
          stage_name,
          well_number,
          last_active_at,
          created_at,
          is_deleted
        ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), 0)
      `, [
        stage.projectId,
        stage.companyId,
        stage.companyName,
        stage.companyShortName,
        stage.projectName,
        stage.stageName,
        stage.wellNumber
      ]);

      // DO NOT automatically save headers - we only want to save headers
      // when the user explicitly selects them for monitoring
    }

    res.json({ stages });
  } catch (error) {
    console.error('Error fetching active stages:', error);
    res.status(500).json({ error: 'Failed to fetch active stages' });
  }
});

// Get all headers for a project
router.get('/project/:projectId/headers', async (req, res) => {
  try {
    const db = await getDb();
    const { projectId } = req.params;

    const headers = await db.all(`
      SELECT 
        h.header_id,
        h.header_name,
        h.is_monitored,
        p.project_name,
        p.company_name,
        p.stage_name,
        p.well_number
      FROM project_header_settings h
      JOIN active_projects p ON h.project_id = p.project_id
      WHERE h.project_id = ?
      ORDER BY h.header_name
    `, [projectId]);

    res.json({ headers });
  } catch (error) {
    console.error('Error fetching project headers:', error);
    res.status(500).json({ error: 'Failed to fetch project headers' });
  }
});

// Update monitoring status for headers
router.post('/project/:projectId/headers/monitor', async (req, res) => {
  try {
    const db = await getDb();
    const { projectId } = req.params;
    const { headers } = req.body; // Array of header IDs to monitor/unmonitor
    const { monitor } = req.body; // true to start monitoring, false to stop

    // Update monitoring status for the specified headers
    for (const headerId of headers) {
      await db.run(`
        UPDATE project_header_settings
        SET 
          is_monitored = ?,
          updated_at = datetime('now')
        WHERE project_id = ? AND header_id = ?
      `, [monitor ? 1 : 0, projectId, headerId]);
    }

    res.json({ 
      success: true, 
      message: `Headers ${monitor ? 'now being' : 'no longer'} monitored`
    });
  } catch (error) {
    console.error('Error updating header monitoring status:', error);
    res.status(500).json({ error: 'Failed to update header monitoring status' });
  }
});

// Get all currently monitored headers
router.get('/monitored-headers', async (req, res) => {
  try {
    const db = await getDb();
    
    const headers = await db.all(`
      SELECT 
        h.header_id,
        h.header_name,
        h.is_monitored,
        p.project_id,
        p.project_name,
        p.company_name,
        p.stage_name,
        p.well_number,
        h.created_at,
        h.updated_at
      FROM project_header_settings h
      JOIN active_projects p ON h.project_id = p.project_id
      WHERE h.is_monitored = 1
      ORDER BY p.company_name, p.project_name, h.header_name
    `);

    res.json({ headers });
  } catch (error) {
    console.error('Error fetching monitored headers:', error);
    res.status(500).json({ error: 'Failed to fetch monitored headers' });
  }
});

export default router; 