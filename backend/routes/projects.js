import express from 'express';
import { ProjectService } from '../services/projectService.js';
import { HeaderMonitorService } from '../services/headerMonitorService.js';

const router = express.Router();

// Get all active projects
router.get('/active', async (req, res) => {
  try {
    const projects = await ProjectService.getActiveProjects();
    res.json({ projects });
  } catch (error) {
    console.error('Error getting active projects:', error);
    res.status(500).json({ error: 'Failed to get active projects' });
  }
});

// Update active project
router.post('/active', async (req, res) => {
  try {
    const success = await ProjectService.upsertActiveProject(req.body);
    if (success) {
      res.json({ message: 'Project updated successfully' });
    } else {
      res.status(500).json({ error: 'Failed to update project' });
    }
  } catch (error) {
    console.error('Error updating active project:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// Get project status
router.get('/:projectId/status', async (req, res) => {
  try {
    const { projectId } = req.params;
    const status = await HeaderMonitorService.getProjectMonitoringStatus(projectId);
    res.json(status);
  } catch (error) {
    console.error(`Error getting status for project ${req.params.projectId}:`, error);
    res.status(500).json({ error: 'Failed to get project status' });
  }
});

// Delete project
router.delete('/active/:projectId', async (req, res) => {
  try {
    const success = await ProjectService.deleteProject(req.params.projectId);
    if (success) {
      res.json({ message: 'Project deleted successfully' });
    } else {
      res.status(500).json({ error: 'Failed to delete project' });
    }
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// Get project header settings
router.get('/:projectId/headers', async (req, res) => {
  try {
    const headerSettings = await ProjectService.getProjectHeaderSettings(req.params.projectId);
    res.json({ headerSettings });
  } catch (error) {
    console.error('Error getting project header settings:', error);
    res.status(500).json({ error: 'Failed to get header settings' });
  }
});

// Update project header settings
router.post('/:projectId/headers', async (req, res) => {
  try {
    const success = await ProjectService.updateProjectHeaderSettings(
      req.params.projectId,
      req.body.headerSettings
    );
    if (success) {
      res.json({ message: 'Header settings updated successfully' });
    } else {
      res.status(500).json({ error: 'Failed to update header settings' });
    }
  } catch (error) {
    console.error('Error updating project header settings:', error);
    res.status(500).json({ error: 'Failed to update header settings' });
  }
});

export { router }; 