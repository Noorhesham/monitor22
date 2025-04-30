import React, { createContext, useState, useEffect, useContext, useCallback, useRef } from 'react';
import {
  loadSettings,
  saveSettings,
  loadHeaderThresholds,
  setHeaderSettings as apiSetHeaderSettings,
  addMonitoredHeader as apiAddMonitoredHeader,
  removeMonitoredHeader as apiRemoveMonitoredHeader
} from '../utils/settings.js';
import { DEFAULT_SETTINGS, validateSettings, mergeWithDefaults } from '../schemas/settings.js';
import axios from 'axios';
import { API_CONFIG, getAuthHeaders } from '../config';

// Create Context
const SettingsContext = createContext();

// Custom Hook to use the context
export const useSettings = () => useContext(SettingsContext);

// Provider Component
export const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState({
    ...DEFAULT_SETTINGS,
    // Ensure webhooks is properly initialized to avoid undefined errors
    webhooks: DEFAULT_SETTINGS.webhooks || {
      enabled: false,
      slackWebhookUrl: "",
      interval: 3600000
    }
  });
  // Add state for header thresholds/settings
  const [headerThresholdsData, setHeaderThresholdsData] = useState({ thresholds: {}, headerSettings: {} });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const currentSettingsRef = useRef(settings);
  const currentThresholdsRef = useRef(headerThresholdsData);

  // Update refs when state changes
  useEffect(() => {
    currentSettingsRef.current = settings;
  }, [settings]);
  useEffect(() => {
    currentThresholdsRef.current = headerThresholdsData;
  }, [headerThresholdsData]);

  // Combined loading function
  const loadAllSettings = useCallback(async () => {
    setError(null);
    let loadedSuccessfully = true;
    try {
      // Use the correct API endpoints with /api prefix
      const settingsUrl = `${API_CONFIG.baseUrl}/api/settings`;
      const thresholdsUrl = `${API_CONFIG.baseUrl}/api/settings/header-thresholds`;
      
      console.log(`Fetching settings from: ${settingsUrl}`);
      console.log(`Fetching thresholds from: ${thresholdsUrl}`);
      
      const [settingsResponse, thresholdsResponse] = await Promise.all([
        axios.get(settingsUrl, { headers: getAuthHeaders() }),
        axios.get(thresholdsUrl, { headers: getAuthHeaders() })
      ]);

      // Process settings
      if (settingsResponse.data) {
        const loadedMainSettings = settingsResponse.data;
        console.log("Loaded settings:", loadedMainSettings);
        
        const mergedSettings = mergeWithDefaults(loadedMainSettings);
        const validation = validateSettings(mergedSettings);
        if (!validation.valid) {
          console.warn('Invalid main settings loaded:', validation.errors);
          setSettings(DEFAULT_SETTINGS); // Fallback
        } else {
          // Only update if data actually changed to prevent unnecessary re-renders
          if (JSON.stringify(currentSettingsRef.current) !== JSON.stringify(mergedSettings)) {
            console.log("Main settings changed, applying updates...");
            setSettings(mergedSettings);
          }
        }
      } else {
        loadedSuccessfully = false;
        setError(prev => prev ? `${prev}; Failed to load main settings` : 'Failed to load main settings');
      }

      // Process thresholds
      if (thresholdsResponse.data) {
        const loadedThresholds = thresholdsResponse.data;
        console.log("Loaded thresholds:", loadedThresholds);
        
        if (JSON.stringify(currentThresholdsRef.current) !== JSON.stringify(loadedThresholds)) {
          console.log("Header thresholds changed, applying updates...");
          setHeaderThresholdsData(loadedThresholds);
        }
      } else {
        loadedSuccessfully = false;
        setError(prev => prev ? `${prev}; Failed to load header thresholds` : 'Failed to load header thresholds');
      }
    } catch (err) {
      console.error("Error loading settings:", err);
      setError(`Failed to load settings: ${err.message || 'Unknown error'}`);
      
      // Fallback to defaults
      setSettings(DEFAULT_SETTINGS); 
      setHeaderThresholdsData({ thresholds: {}, headerSettings: {} });
      loadedSuccessfully = false;
    }
    return loadedSuccessfully;
  }, []);

  // Initial load
  useEffect(() => {
    const initialize = async () => {
      setIsLoading(true);
      await loadAllSettings();
      setIsLoading(false);
    };
    initialize();
  }, [loadAllSettings]);

  // Polling (reloads all settings including thresholds)
  useEffect(() => {
    const intervalId = setInterval(async () => {
      console.log("Polling for settings changes...");
      await loadAllSettings();
    }, 15000); // Poll every 15 seconds
    return () => clearInterval(intervalId);
  }, [loadAllSettings]);

  // Update main settings function
  const updateSettings = useCallback(async (newSettings) => {
    setIsUpdating(true);
    setError(null);
    
    try {
      const result = await saveSettings(newSettings);
      if (result) {
        setSettings(newSettings);
        console.log('Settings updated successfully');
      } else {
        throw new Error('Failed to save settings');
      }
      return true;
    } catch (err) {
      console.error('Error updating settings:', err);
      setError(err.message);
      return false;
    } finally {
      setIsUpdating(false);
    }
  }, []);

  // Function to update specific header settings
  const setHeaderSettings = useCallback(async (headerId, settingsUpdate) => {
    try {
      const success = await apiSetHeaderSettings(headerId, settingsUpdate);
      if (!success) {
        throw new Error('API save failed for header settings');
      }
      // No explicit reload needed here, loadHeaderThresholds is called within apiSetHeaderSettings
    } catch (err) {
      console.error(`Error updating header settings for ${headerId}:`, err);
      setError(`Failed to update header ${headerId} settings: ${err.message}`);
    }
  }, []);

  // Function to add a monitored header
  const addMonitoredHeader = useCallback(async (headerId, settings = {}) => {
    try {
      const success = await apiAddMonitoredHeader(headerId, settings);
      if (!success) {
        throw new Error('API call to add header failed');
      }
      // Reload handled within apiAddMonitoredHeader
      return true;
    } catch (err) {
      console.error(`Error adding monitored header ${headerId}:`, err);
      setError(`Failed to add header ${headerId}: ${err.message}`);
      return false;
    }
  }, []);

  // Function to remove a monitored header
  const removeMonitoredHeader = useCallback(async (headerId) => {
    try {
      const success = await apiRemoveMonitoredHeader(headerId);
      if (!success) {
        throw new Error('API call to remove header failed');
      }
      // Reload handled within apiRemoveMonitoredHeader
      return true;
    } catch (err) { 
      console.error(`Error removing monitored header ${headerId}:`, err);
      setError(`Failed to remove header ${headerId}: ${err.message}`);
      return false;
    }
  }, []);

  // Specific update functions using the generic ones
  const updatePollingInterval = useCallback((seconds) => {
    const numSeconds = Number(seconds);
    if (!isNaN(numSeconds) && numSeconds > 0) {
      updateSettings({ pollingInterval: numSeconds });
    }
  }, [updateSettings]);

  // Add this new function to specifically update pattern categories
  const updatePatternCategory = useCallback(async (category, updates) => {
    setIsUpdating(true);
    
    try {
      const updatedSettings = { ...settings };
      
      // Ensure the path exists
      if (!updatedSettings.patternCategories) {
        updatedSettings.patternCategories = {};
      }
      
      if (!updatedSettings.patternCategories[category]) {
        updatedSettings.patternCategories[category] = {};
      }
      
      // Apply the updates
      updatedSettings.patternCategories[category] = {
        ...updatedSettings.patternCategories[category],
        ...updates
      };
      
      // Save the updated settings
      const result = await saveSettings(updatedSettings);
      
      if (result) {
        setSettings(updatedSettings);
        console.log(`Pattern category ${category} updated successfully`);
        return true;
      } else {
        throw new Error(`Failed to update pattern category ${category}`);
      }
    } catch (error) {
      console.error(`Error updating pattern category ${category}:`, error);
      setError(error.message);
      return false;
    } finally {
      setIsUpdating(false);
    }
  }, [settings, saveSettings]);

  const updatePressureAlertDuration = useCallback((seconds) => {
    const duration = Number(seconds);
    if (!isNaN(duration) && duration > 0) {
      updatePatternCategory('pressure', { alertDuration: duration });
    }
  }, [updatePatternCategory]);

  const updateBatteryAlertDuration = useCallback((seconds) => {
    const duration = Number(seconds);
    if (!isNaN(duration) && duration > 0) {
      updatePatternCategory('battery', { alertDuration: duration });
    }
  }, [updatePatternCategory]);
  
  const updateFrozenThreshold = useCallback((seconds) => {
    const duration = Number(seconds);
    if (!isNaN(duration) && duration > 0) {
      updatePatternCategory('pressure', { frozenThreshold: duration });
      // Note: Could also apply to battery if needed
    }
  }, [updatePatternCategory]);

  const updateBatteryThreshold = useCallback((percentage) => {
    const threshold = Number(percentage);
    if (!isNaN(threshold) && threshold >= 0 && threshold <= 100) {
      updatePatternCategory('battery', { threshold: threshold });
    } else if (percentage === '' || percentage === null) {
      updatePatternCategory('battery', { threshold: null }); // Allow clearing
    }
  }, [updatePatternCategory]);

  const updateWebhookSettings = useCallback((settingsUpdate) => {
    updateSettings({
      webhooks: {
        ...currentSettingsRef.current.webhooks,
        ...settingsUpdate
      }
    });
  }, [updateSettings]);

  // ... (snooze logic remains largely the same) ...
  const updateSnoozeSettings = useCallback((alertId, duration) => {
    const newSnoozeSettings = {
      ...currentSettingsRef.current.snoozeSettings,
      [alertId]: {
        snoozedAt: Date.now(),
        duration
      }
    };
    updateSettings({ snoozeSettings: newSnoozeSettings });
  }, [updateSettings]);

  const isAlertSnoozed = useCallback((alertId) => {
    const snoozeInfo = settings.snoozeSettings[alertId];
    if (!snoozeInfo) return false;
    const { snoozedAt, duration } = snoozeInfo;
    return Date.now() < snoozedAt + duration;
  }, [settings.snoozeSettings]);

  useEffect(() => {
    // ... (snooze cleanup logic remains the same) ...
  }, [updateSettings]);

  const value = {
    // Main settings values
    pollingIntervalSeconds: settings.pollingInterval,
    patternCategories: settings.patternCategories,
    webhooks: settings.webhooks,
    snoozeSettings: settings.snoozeSettings,
    // Derived values (ensure defaults)
    pressureAlertDuration: settings.patternCategories?.pressure?.alertDuration ?? 20,
    frozenDataThreshold: settings.patternCategories?.pressure?.frozenThreshold ?? 120,
    batteryAlertDuration: settings.patternCategories?.battery?.alertDuration ?? 120,
    // Header thresholds data
    headerThresholdsData, // Provides { thresholds: {...}, headerSettings: {...}, ... }
    // Loading and error states
    isLoadingSettings: isLoading,
    settingsError: error,
    // Update functions
    updatePollingInterval,
    updatePatternCategory,
    updateWebhookSettings,
    snoozeAlert: updateSnoozeSettings,
    isAlertSnoozed,
    // New specific setters from Settings.jsx
    updatePressureAlertDuration,
    updateBatteryAlertDuration,
    updateFrozenThreshold,
    updateBatteryThreshold,
    // Function to update individual header settings
    setHeaderSettings,
    addMonitoredHeader,
    removeMonitoredHeader
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}; 