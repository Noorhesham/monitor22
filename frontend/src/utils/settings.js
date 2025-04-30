import { API_CONFIG } from '@config';

// Load settings from backend
export async function loadSettings() {
  try {
    const response = await fetch(`${API_CONFIG.baseUrl}/api/settings`);
    if (!response.ok) {
      throw new Error(`Failed to load settings: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error loading settings:', error);
    return null;
  }
}

// Save settings to backend
export async function saveSettings(settings) {
  try {
    const response = await fetch(`${API_CONFIG.baseUrl}/api/settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(settings)
    });
    if (!response.ok) {
      throw new Error(`Failed to save settings: ${response.status}`);
    }
    return true;
  } catch (error) {
    console.error('Error saving settings:', error);
    return false;
  }
}

// Load header thresholds from backend
export async function loadHeaderThresholds() {
  try {
    const response = await fetch(`${API_CONFIG.baseUrl}/api/settings/header-thresholds`);
    if (!response.ok) {
      throw new Error(`Failed to load header thresholds: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error loading header thresholds:', error);
    return null;
  }
}

// Update header settings
export async function setHeaderSettings(headerId, settings) {
  try {
    const response = await fetch(`${API_CONFIG.baseUrl}/api/settings/header/${headerId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(settings)
    });
    if (!response.ok) {
      throw new Error(`Failed to update header settings: ${response.status}`);
    }
    return true;
  } catch (error) {
    console.error('Error updating header settings:', error);
    return false;
  }
}

// Add header to monitoring
export async function addMonitoredHeader(headerId, settings = {}) {
  try {
    const response = await fetch(`${API_CONFIG.baseUrl}/api/settings/monitored-headers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ headerId, ...settings })
    });
    if (!response.ok) {
      throw new Error(`Failed to add monitored header: ${response.status}`);
    }
    return true;
  } catch (error) {
    console.error('Error adding monitored header:', error);
    return false;
  }
}

// Remove header from monitoring
export async function removeMonitoredHeader(headerId) {
  try {
    const response = await fetch(`${API_CONFIG.baseUrl}/api/settings/monitored-headers/${headerId}`, {
      method: 'DELETE'
    });
    if (!response.ok) {
      throw new Error(`Failed to remove monitored header: ${response.status}`);
    }
    return true;
  } catch (error) {
    console.error('Error removing monitored header:', error);
    return false;
  }
} 