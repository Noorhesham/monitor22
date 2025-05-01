import axios from 'axios';

const API_BASE_URL = '/api';

// Active stages
export const fetchActiveStages = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/monitoring/active-stages`);
    return response.data;
  } catch (error) {
    console.error('Error fetching active stages:', error);
    throw error;
  }
};

// Headers
export const fetchStageHeaders = async (stageId) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/monitoring/headers/${stageId}`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching headers for stage ${stageId}:`, error);
    throw error;
  }
};

// Monitored headers
export const fetchMonitoredHeaders = async (headerIds = []) => {
  try {
    let url = `${API_BASE_URL}/monitoring/monitored-headers`;
    if (headerIds.length > 0) {
      const idsString = headerIds.join(',');
      url += `?headerIds=${idsString}`;
    }
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error('Error fetching monitored headers:', error);
    throw error;
  }
};
export const addMonitoredHeader = async (headerData) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/monitoring/monitored-headers`, headerData);
    return response.data;
  } catch (error) {
    console.error('Error adding monitored header:', error);
    throw error;
  }
};

export const updateHeaderSettings = async (headerId, settings) => {
  try {
    const response = await axios.put(`${API_BASE_URL}/monitoring/monitored-headers/${headerId}/settings`, settings);
    return response.data;
  } catch (error) {
    console.error(`Error updating settings for header ${headerId}:`, error);
    throw error;
  }
};

export const removeMonitoredHeader = async (headerId) => {
  try {
    await axios.delete(`${API_BASE_URL}/monitoring/monitored-headers/${headerId}`);
    return headerId;
  } catch (error) {
    console.error(`Error removing monitored header ${headerId}:`, error);
    throw error;
  }
};

export const removeProjectHeaders = async (projectId) => {
  try {
    await axios.delete(`${API_BASE_URL}/monitoring/monitored-headers/project/${projectId}`);
    return projectId;
  } catch (error) {
    console.error(`Error removing headers for project ${projectId}:`, error);
    throw error;
  }
};

// Header values
export const fetchHeaderValues = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/monitoring/header-values`);
    return response.data;
  } catch (error) {
    console.error('Error fetching header values:', error);
    throw error;
  }
};

// Alerts
export const fetchAlerts = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/monitoring/alerts`);
    return response.data;
  } catch (error) {
    console.error('Error fetching alerts:', error);
    throw error;
  }
};

export const snoozeAlert = async (alertId, duration = 3600) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/monitoring/alerts/${alertId}/snooze`, { duration });
    return response.data;
  } catch (error) {
    console.error(`Error snoozing alert ${alertId}:`, error);
    throw error;
  }
};

export const dismissAlert = async (alertId) => {
  try {
    await axios.delete(`${API_BASE_URL}/monitoring/alerts/${alertId}`);
    return alertId;
  } catch (error) {
    console.error(`Error dismissing alert ${alertId}:`, error);
    throw error;
  }
};

// Settings
export const fetchSettings = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/settings`);
    return response.data;
  } catch (error) {
    console.error('Error fetching settings:', error);
    throw error;
  }
};

export const updateSettings = async (settings) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/settings`, settings);
    return response.data;
  } catch (error) {
    console.error('Error updating settings:', error);
    throw error;
  }
};

export const updatePatternCategories = async (patternCategories) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/settings/patterns`, { patternCategories });
    return response.data;
  } catch (error) {
    console.error('Error updating pattern categories:', error);
    throw error;
  }
}; 