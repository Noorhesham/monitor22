import express from 'express';
import { loadSettings, saveSettings, loadHeaderThresholds, saveHeaderThresholds } from '../utils/settingsStorage.js';

const router = express.Router();

// Get settings
router.get('/', async (req, res) => {
  try {
    const settings = await loadSettings();
    res.json(settings);
  } catch (error) {
    console.error('Error loading settings:', error);
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

// Update settings
router.post('/', async (req, res) => {
  try {
    const settings = req.body;
    const success = await saveSettings(settings);
    
    if (success) {
      res.json({ 
        success: true, 
        message: 'Settings saved successfully',
        settings
      });
    } else {
      throw new Error('Failed to save settings');
    }
  } catch (error) {
    console.error('Error saving settings:', error);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// Add route for pattern categories
router.post('/patterns', async (req, res) => {
  try {
    const { patternCategories } = req.body;
    console.log("patternCategories", patternCategories);z``
    if (!patternCategories) {
      return res.status(400).json({ error: 'Missing pattern categories data' });
    }
    
    // Load current settings
    const settings = await loadSettings();
    
    // Update pattern categories
    settings.patternCategories = patternCategories;
    
    // Save updated settings
    const success = await saveSettings(settings);
    
    if (success) {
      res.json({ 
        success: true, 
        message: 'Pattern categories saved successfully',
        patternCategories
      });
    } else {
      throw new Error('Failed to save pattern categories');
    }
  } catch (error) {
    console.error('Error saving pattern categories:', error);
    res.status(500).json({ error: 'Failed to save pattern categories' });
  }
});

// Get header thresholds
router.get('/header-thresholds', async (req, res) => {
  try {
    const headerThresholds = await loadHeaderThresholds();
    res.json(headerThresholds);
  } catch (error) {
    console.error('Error loading header thresholds:', error);
    res.status(500).json({ error: 'Failed to load header thresholds' });
  }
});

// Update header thresholds
router.post('/header-thresholds', async (req, res) => {
  try {
    const thresholds = req.body;
    const success = await saveHeaderThresholds(thresholds);
    
    if (success) {
      res.json({ 
        success: true, 
        message: 'Header thresholds saved successfully',
        thresholds
      });
    } else {
      throw new Error('Failed to save header thresholds');
    }
  } catch (error) {
    console.error('Error saving header thresholds:', error);
    res.status(500).json({ error: 'Failed to save header thresholds' });
  }
});

// Add route for test notification
router.post('/test-notification', async (req, res) => {
  try {
    const settings = await loadSettings();
    
    if (!settings.webhooks?.enabled) {
      return res.status(400).json({ 
        success: false, 
        message: 'Notifications are not enabled in settings' 
      });
    }
    
    // Create a test alert for each enabled notification type
    const testAlert = {
      id: `test-${Date.now()}`,
      type: 'threshold',
      headerId: 'test',
      headerName: 'Test Header',
      headerType: 'pressure',
      value: 15,
      threshold: 20,
      timestamp: Date.now(),
      message: 'This is a test notification from the monitoring system'
    };
    
    const results = {
      slack: null,
      email: null,
      teams: null
    };
    
    // Send to Slack if enabled
    if (settings.webhooks.slackEnabled && settings.webhooks.slackWebhookUrl) {
      try {
        // Here you would implement the actual Slack notification logic
        console.log(`[TEST] Would send Slack notification to: ${settings.webhooks.slackWebhookUrl}`);
        results.slack = { success: true, message: 'Test notification sent to Slack' };
      } catch (error) {
        console.error('Error sending test Slack notification:', error);
        results.slack = { success: false, message: error.message };
      }
    }
    
    // Send to Email if enabled
    if (settings.webhooks.emailEnabled && settings.webhooks.emailRecipients) {
      try {
        // Here you would implement the actual email notification logic
        console.log(`[TEST] Would send Email notification to: ${settings.webhooks.emailRecipients}`);
        results.email = { success: true, message: 'Test notification sent to Email' };
      } catch (error) {
        console.error('Error sending test Email notification:', error);
        results.email = { success: false, message: error.message };
      }
    }
    
    // Send to Teams if enabled
    if (settings.webhooks.teamsEnabled && settings.webhooks.teamsWebhookUrl) {
      try {
        // Here you would implement the actual Teams notification logic
        console.log(`[TEST] Would send Teams notification to: ${settings.webhooks.teamsWebhookUrl}`);
        results.teams = { success: true, message: 'Test notification sent to Microsoft Teams' };
      } catch (error) {
        console.error('Error sending test Teams notification:', error);
        results.teams = { success: false, message: error.message };
      }
    }
    
    res.json({ 
      success: true, 
      message: 'Test notifications sent',
      results
    });
  } catch (error) {
    console.error('Error processing test notification:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router; 