import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';

// Default settings
const DEFAULT_POLLING_INTERVAL = 5;
const DEFAULT_FROZEN_THRESHOLD = 120;

// Default patterns to use as fallback
const DEFAULT_POSITIVE_PATTERNS = ["pressure", "casing", "tubing", "cbt", "bat", "battery"];
const DEFAULT_NEGATIVE_PATTERNS = [
  "fdi", "derivative", "projected", "curve", "predicted", "qc",
  "pumpdown", "treating", "inverse", "hydrostatic", "measuredpressure",
  "natural", "gas", "seal", "p-seal"
];

// Create Context
const SettingsContext = createContext();

// Custom Hook to use the context
export const useSettings = () => useContext(SettingsContext);

// Provider Component
export const SettingsProvider = ({ children }) => {
  const [positivePatterns, setPositivePatterns] = useState(DEFAULT_POSITIVE_PATTERNS);
  const [negativePatterns, setNegativePatterns] = useState(DEFAULT_NEGATIVE_PATTERNS);
  const [pollingIntervalSeconds, setPollingIntervalSeconds] = useState(DEFAULT_POLLING_INTERVAL);
  const [frozenDataThresholdSeconds, setFrozenDataThresholdSeconds] = useState(DEFAULT_FROZEN_THRESHOLD);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch initial patterns from JSON
  useEffect(() => {
    const fetchPatterns = async () => {
      setIsLoading(true);
      setError(null);
      try {
        console.log('Fetching patterns from /settings/patterns.json');
        // Use direct import for JSON file in the public directory
        const response = await fetch('/settings/patterns.json');
        console.log('Patterns response status:', response.status, response.statusText);
        
        if (!response.ok) {
          throw new Error(`Failed to load patterns.json: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('Patterns loaded successfully:', data);
        
        if (data?.positivePatterns) {
          setPositivePatterns(data.positivePatterns);
        }
        
        if (data?.negativePatterns) {
          setNegativePatterns(data.negativePatterns);
        }
      } catch (err) {
        console.error("Error loading patterns.json:", err);
        // Already using fallback patterns from initial state
        setError(`Failed to load patterns configuration: ${err.message}. Using defaults.`);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchPatterns();
  }, []);

  // Functions to update settings (will be used by Settings page later)
  const updatePositivePatterns = useCallback((newPatterns) => {
    setPositivePatterns(newPatterns);
    // TODO: Add logic to save to backend/localStorage if persistence needed
  }, []);

  const updateNegativePatterns = useCallback((newPatterns) => {
    setNegativePatterns(newPatterns);
    // TODO: Add logic to save to backend/localStorage if persistence needed
  }, []);

  const updatePollingInterval = useCallback((seconds) => {
    const numSeconds = Number(seconds);
    if (!isNaN(numSeconds) && numSeconds > 0) {
      setPollingIntervalSeconds(numSeconds);
      // TODO: Add logic to save to backend/localStorage if persistence needed
    }
  }, []);

  const updateFrozenThreshold = useCallback((seconds) => {
    const numSeconds = Number(seconds);
    if (!isNaN(numSeconds) && numSeconds >= 0) {
      setFrozenDataThresholdSeconds(numSeconds);
      // TODO: Add logic to save to backend/localStorage if persistence needed
    }
  }, []);

  const value = {
    positivePatterns,
    negativePatterns,
    pollingIntervalSeconds,
    frozenDataThresholdSeconds,
    isLoadingSettings: isLoading,
    settingsError: error,
    updatePositivePatterns,
    updateNegativePatterns,
    updatePollingInterval,
    updateFrozenThreshold,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}; 