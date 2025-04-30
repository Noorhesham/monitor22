import fetch from 'node-fetch';
import { loadSettings } from '../utils/settingsStorage.js';
import { getDb } from '../database/db.js';

// Store last notification times for each header
const lastNotificationTimes = new Map();

// Main function to send alert notifications
export async function sendAlertNotifications(alerts) {
  if (!alerts || alerts.length === 0) {
    console.log('[Notifications] No alerts to send');
    return;
  }

  try {
    const settings = await loadSettings();
    
    // Exit early if webhooks are not enabled
    if (!settings.webhooks?.enabled) {
      return;
    }
    
    console.log(`[Notifications] Preparing to send ${alerts.length} alerts`);
    
    // Filter alerts by type if necessary
    const filteredAlerts = alerts.filter(alert => {
      switch (alert.type) {
        case 'threshold':
          return settings.webhooks.sendThresholdAlerts !== false;
        case 'frozen':
          return settings.webhooks.sendFrozenAlerts !== false;
        case 'error':
          return settings.webhooks.sendErrorAlerts !== false;
        default:
          return true;
      }
    });
    
    if (filteredAlerts.length === 0) {
      console.log('[Notifications] No alerts to send after filtering');
      return;
    }
    
    // Filter alerts based on per-header notification intervals
    const now = Date.now();
    const filteredByInterval = await filterAlertsByNotificationInterval(filteredAlerts, settings, now);
    
    if (filteredByInterval.length === 0) {
      console.log('[Notifications] No alerts to send after interval filtering');
      return;
    }
    
    // Send notifications through each enabled channel
    const notificationPromises = [];
    
    // Slack notifications
    if (settings.webhooks.slackEnabled !== false && settings.webhooks.slackWebhookUrl) {
      notificationPromises.push(sendSlackNotification(settings.webhooks.slackWebhookUrl, filteredByInterval));
    }
    
    // Microsoft Teams notifications
    if (settings.webhooks.teamsEnabled && settings.webhooks.teamsWebhookUrl) {
      notificationPromises.push(sendTeamsNotification(settings.webhooks.teamsWebhookUrl, filteredByInterval));
    }
    
    // Custom webhooks
    if (Array.isArray(settings.webhooks.customWebhooks) && settings.webhooks.customWebhooks.length > 0) {
      for (const webhookUrl of settings.webhooks.customWebhooks) {
        notificationPromises.push(sendCustomWebhookNotification(webhookUrl, filteredByInterval));
      }
    }
    
    // Wait for all notifications to be sent
    await Promise.allSettled(notificationPromises);
    
    // Update last notification times
    for (const alert of filteredByInterval) {
      lastNotificationTimes.set(alert.headerId, now);
    }
    
    console.log('[Notifications] Finished sending notifications');
  } catch (error) {
    console.error('[Notifications] Error sending notifications:', error);
  }
}

// Filter alerts based on per-header notification intervals
async function filterAlertsByNotificationInterval(alerts, settings, now) {
  try {
    // Get header types for determining notification intervals
    const headerTypes = {};
    const db = await getDb();
    
    for (const alert of alerts) {
      if (!headerTypes[alert.headerId]) {
        // First try to get the header type from the database
        const headerSettings = await db.get(
          `SELECT * FROM project_header_settings WHERE header_id = ?`,
          [alert.headerId]
        );
        
        if (headerSettings) {
          // Determine header type based on patterns
          const headerName = headerSettings.header_name.toLowerCase();
          let type = 'unknown';
          
          if (settings.patternCategories?.pressure?.patterns) {
            const matches = settings.patternCategories.pressure.patterns.some(pattern => 
              headerName.includes(pattern.toLowerCase())
            );
            if (matches) type = 'pressure';
          }
          
          if (type === 'unknown' && settings.patternCategories?.battery?.patterns) {
            const matches = settings.patternCategories.battery.patterns.some(pattern => 
              headerName.includes(pattern.toLowerCase())
            );
            if (matches) type = 'battery';
          }
          
          headerTypes[alert.headerId] = type;
        } else {
          headerTypes[alert.headerId] = 'unknown';
        }
      }
    }
    
    // Get notification intervals for each type
    const intervals = {
      pressure: settings.patternCategories?.pressure?.notificationInterval * 1000 || 300000,
      battery: settings.patternCategories?.battery?.notificationInterval * 1000 || 300000,
      unknown: 300000 // 5 minutes default
    };
    
    return alerts.filter(alert => {
      const headerType = headerTypes[alert.headerId] || 'unknown';
      const interval = intervals[headerType];
      const lastTime = lastNotificationTimes.get(alert.headerId) || 0;
      
      return (now - lastTime) >= interval;
    });
  } catch (error) {
    console.error('[Notifications] Error filtering alerts by interval:', error);
    return alerts; // On error, return all alerts
  }
}

// Send notification to Slack
async function sendSlackNotification(webhookUrl, alerts) {
  try {
    console.log(`[Notifications] Sending ${alerts.length} alerts to Slack`);
    
    // Format the alert message for Slack
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `🚨 FracBrain Monitoring - ${alerts.length} Alert${alerts.length > 1 ? 's' : ''}`,
          emoji: true
        }
      },
      {
        type: 'divider'
      }
    ];
    
    // Add alert blocks
    alerts.forEach(alert => {
      const alertBlock = {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: formatAlertForSlack(alert)
        }
      };
      
      blocks.push(alertBlock);
      blocks.push({ type: 'divider' });
    });
    
    // Add a context block with timestamp
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `*Sent:* ${new Date().toISOString()}`
        }
      ]
    });
    
    // Send the message to Slack
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        blocks
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Slack notification failed: ${response.status} - ${errorText}`);
    }
    
    console.log('[Notifications] Successfully sent Slack notification');
  } catch (error) {
    console.error('[Notifications] Error sending Slack notification:', error);
    throw error;
  }
}

// Send notification to Microsoft Teams
async function sendTeamsNotification(webhookUrl, alerts) {
  try {
    console.log(`[Notifications] Sending ${alerts.length} alerts to Microsoft Teams`);
    
    // Format the Teams message
    const sections = alerts.map(alert => ({
      activityTitle: getAlertTitle(alert),
      activitySubtitle: alert.headerName,
      text: formatAlertForTeams(alert),
      facts: [
        {
          name: 'Type',
          value: alert.type.charAt(0).toUpperCase() + alert.type.slice(1)
        },
        {
          name: 'Time',
          value: new Date(alert.timestamp).toLocaleString()
        }
      ]
    }));
    
    const payload = {
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      themeColor: '0076D7',
      summary: `FracBrain Monitoring - ${alerts.length} Alert${alerts.length > 1 ? 's' : ''}`,
      sections
    };
    
    // Send the message to Teams
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Teams notification failed: ${response.status} - ${errorText}`);
    }
    
    console.log('[Notifications] Successfully sent Teams notification');
  } catch (error) {
    console.error('[Notifications] Error sending Teams notification:', error);
    throw error;
  }
}

// Send notification to a custom webhook
async function sendCustomWebhookNotification(webhookUrl, alerts) {
  try {
    console.log(`[Notifications] Sending ${alerts.length} alerts to custom webhook: ${webhookUrl}`);
    
    // Create a generic payload that should work with most webhook systems
    const payload = {
      title: `FracBrain Monitoring - ${alerts.length} Alert${alerts.length > 1 ? 's' : ''}`,
      timestamp: new Date().toISOString(),
      alerts: alerts.map(alert => ({
        id: alert.id,
        type: alert.type,
        headerName: alert.headerName,
        headerId: alert.headerId,
        value: alert.value,
        threshold: alert.threshold,
        timestamp: alert.timestamp,
        message: getAlertMessage(alert)
      }))
    };
    
    // Send the payload to the custom webhook
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Custom webhook notification failed: ${response.status} - ${errorText}`);
    }
    
    console.log('[Notifications] Successfully sent custom webhook notification');
  } catch (error) {
    console.error(`[Notifications] Error sending notification to ${webhookUrl}:`, error);
    // Don't throw here so other webhooks can still be tried
  }
}

// Helper functions to format alerts for different platforms

function getAlertTitle(alert) {
  switch (alert.type) {
    case 'threshold':
      return '⚠️ Threshold Alert';
    case 'frozen':
      return '❄️ Frozen Data Alert';
    case 'error':
      return '⛔ Error Alert';
    default:
      return '🚨 Alert';
  }
}

function getAlertMessage(alert) {
  switch (alert.type) {
    case 'threshold':
      return `Value ${alert.value} is ${alert.value < alert.threshold ? 'below' : 'above'} threshold (${alert.threshold})`;
    case 'frozen':
      return `Value hasn't changed for ${alert.frozenDuration || Math.floor((alert.timestamp - alert.lastChangeTime)/1000)} seconds`;
    case 'error':
      return alert.message || 'Unknown error';
    default:
      return alert.message || 'Alert triggered';
  }
}

function formatAlertForSlack(alert) {
  let message = '';
  
  switch (alert.type) {
    case 'threshold':
      message = `*⚠️ Threshold Alert*\n*Header:* ${alert.headerName}\n*Value:* ${alert.value} (${alert.value < alert.threshold ? 'below' : 'above'} threshold ${alert.threshold})\n*Duration:* ${alert.duration || 'N/A'} seconds`;
      break;
    case 'frozen':
      message = `*❄️ Frozen Data Alert*\n*Header:* ${alert.headerName}\n*Value:* ${alert.value || 'N/A'}\n*Frozen for:* ${alert.frozenDuration || Math.floor((alert.timestamp - alert.lastChangeTime)/1000)} seconds`;
      break;
    case 'error':
      message = `*⛔ Error Alert*\n*Header:* ${alert.headerName}\n*Error:* ${alert.message || 'Unknown error'}`;
      break;
    default:
      message = `*🚨 Alert*\n*Header:* ${alert.headerName}\n*Info:* ${alert.message || JSON.stringify(alert)}`;
  }
  
  message += `\n*Time:* <!date^${Math.floor(alert.timestamp/1000)}^{date_short_pretty} at {time}|${new Date(alert.timestamp).toLocaleString()}>`;
  
  return message;
}

function formatAlertForTeams(alert) {
  let message = '';
  
  switch (alert.type) {
    case 'threshold':
      message = `**Value:** ${alert.value} (${alert.value < alert.threshold ? 'below' : 'above'} threshold ${alert.threshold})\n\n**Duration:** ${alert.duration || 'N/A'} seconds`;
      break;
    case 'frozen':
      message = `**Value:** ${alert.value || 'N/A'}\n\n**Frozen for:** ${alert.frozenDuration || Math.floor((alert.timestamp - alert.lastChangeTime)/1000)} seconds`;
      break;
    case 'error':
      message = `**Error:** ${alert.message || 'Unknown error'}`;
      break;
    default:
      message = `**Info:** ${alert.message || JSON.stringify(alert)}`;
  }
  
  return message;
} 