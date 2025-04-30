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
