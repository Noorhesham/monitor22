// Simplified useMonitoring Hook Stub
// This hook no longer performs active monitoring on the client-side.
// It might be removed entirely later if state is managed in Dashboard.jsx

import { useState, useEffect, useCallback, useRef } from "react";
import useApi from "./useApi";
import { DEFAULT_SETTINGS } from "../../../backend-monitor/schemas/settings.js";
import { useSelector } from "react-redux";

const DEBUG_MODE = true;

/**
 * Custom hook for monitoring header values and managing alerts
 * @param {Object} options Configuration options
 * @param {number} options.pollingInterval Interval in ms for polling header values
 * @param {number} options.frozenDataThreshold Threshold in ms to consider data frozen
 * @param {Function} options.getHeaderCategory Function to determine header category and settings
 * @param {Object} options.thresholds Custom thresholds for headers
 */
export default function useMonitoring({
  pollingInterval = DEFAULT_SETTINGS.pollingInterval * 1000,  // Default but will be overridden with Redux state
  frozenDataThreshold = DEFAULT_SETTINGS.patternCategories.pressure.frozenThreshold * 1000,
  getHeaderCategory,
  thresholds = {}
} = {}) {
  const api = useApi();
  const { settings } = useSelector(state => state.settings);
  
  // Use settings from Redux if available, fallback to props/defaults
  const actualPollingInterval = settings?.pollingInterval 
    ? settings.pollingInterval * 1000 
    : pollingInterval;

  useEffect(() => {
    console.log(`useMonitoring: Using polling interval of ${actualPollingInterval}ms`);
  }, [actualPollingInterval]);

  // State
  const [monitoredHeaders, setMonitoredHeaders] = useState([]);
  const [headerValues, setHeaderValues] = useState({});
  const [alerts, setAlerts] = useState([]);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [headerContinuity, setHeaderContinuity] = useState({});
  const [activeStageIds, setActiveStageIds] = useState({});

  // Refs for tracking
  const intervalRef = useRef(null);
  const headerHistoryRef = useRef({}); // Store history of values for alert checking
  const activeStageCheckIntervalRef = useRef(null);

  // API URL for monitoring status
  const API_URL = useRef(process.env.MONITORING_API_BASE || 'http://localhost:3002/status');

  // Function to check and update active stages
  const updateActiveStages = useCallback(async () => {
    try {
      if (DEBUG_MODE) {
        console.log('Checking for active stages...');
      }

      const response = await api.get('/monitoring/active-stages');
      const activeStages = response.data || [];
      
      // Build map of projectId -> stageId
      const newActiveStageIds = {};
      activeStages.forEach(stage => {
        if (stage.projectId) {
          newActiveStageIds[stage.projectId] = stage.stageId;
        }
      });
      
      setActiveStageIds(newActiveStageIds);
      
      // Don't automatically stop monitoring headers - only backend will handle this
      // during proper stage transitions. The frontend should only display warnings.
      if (DEBUG_MODE) {
        // Log information about potentially outdated headers without stopping them
        monitoredHeaders.forEach(header => {
          if (header.projectId && 
              newActiveStageIds[header.projectId] && 
              header.stageId && 
              newActiveStageIds[header.projectId] !== header.stageId) {
            console.log(`Warning: Header ${header.id} (${header.name}) is from stage ${header.stageId}, ` + 
                        `but current active stage is ${newActiveStageIds[header.projectId]}`);
          }
        });
      }
    } catch (err) {
      console.error('Error checking active stages:', err);
    }
  }, [api, monitoredHeaders]);

  // Set up periodic check of active stages
  useEffect(() => {
    if (isMonitoring) {
      // Initial check
      updateActiveStages();
      
      // Set up interval for checking (every 60 seconds)
      activeStageCheckIntervalRef.current = setInterval(updateActiveStages, 60 * 1000);
    }
    
    return () => {
      if (activeStageCheckIntervalRef.current) {
        clearInterval(activeStageCheckIntervalRef.current);
        activeStageCheckIntervalRef.current = null;
      }
    };
  }, [isMonitoring, updateActiveStages]);

  // Check if a header API response indicates it's no longer valid
  const isHeaderResponseInvalid = useCallback((response) => {
    // Check for common indicators of an invalid/old header
    if (!response) return true;
    
    // Check for error status
    if (response.status >= 400) return true;
    
    // Empty response or missing data
    if (!response.data) return true;
    
    // Check if the header is from an ENDED stage
    if (response.data.state === 'ENDED') return true;
    
    // Missing value could indicate the header is no longer valid
    if (response.data.value === undefined || response.data.value === null) {
      // But only if the header also has no data array or empty data array
      if (!response.data.data || response.data.data.length === 0) {
        return true;
      }
    }
    
    return false;
  }, []);

  // Check both threshold and frozen data alerts based on value history
  const checkAlerts = useCallback((header, value) => {
    if (!header || value === undefined) return;

    const { id, name, stageId, projectId } = header;
    
    // Skip if header is not being monitored
    if (!headerValues[id] || !headerValues[id].isMonitored) {
      return;
    }

    const continuity = headerContinuity[id];
    
    // Only create alerts for the current stage
    if (continuity && continuity.currentStageId !== stageId) {
      return;
    }
    
    // Skip if we know this header's stage is not active
    if (projectId && activeStageIds[projectId] && activeStageIds[projectId] !== stageId) {
      if (DEBUG_MODE) {
        console.log(`Skipping alerts for header ${id} (${name}) from inactive stage ${stageId}, current active stage is ${activeStageIds[projectId]}`);
      }
      return;
    }

    const category = getHeaderCategory(name);
    if (!category) return;

    const now = Date.now();
    
    // Initialize or get history array for this header
    if (!headerHistoryRef.current[id]) {
      headerHistoryRef.current[id] = [];
    }
    
    // Add the new data point with timestamp
    headerHistoryRef.current[id].push({
      value,
      timestamp: now
    });
    
    // Get custom or default settings for this header
    const headerThreshold = thresholds[id] ?? category.threshold;
    const headerFrozenThreshold = thresholds[id]?.frozenThreshold ?? 
      (settings?.patternCategories?.[category.category]?.frozenThreshold * 1000 || frozenDataThreshold);
    const headerAlertDuration = thresholds[id]?.alertDuration ?? 
      (category.alertDuration * 1000);
    
    // Determine max history window needed (use the larger of alert durations plus buffer)
    const maxHistoryMs = Math.max(headerFrozenThreshold, headerAlertDuration) + actualPollingInterval * 3;
    
    // Prune history to keep memory usage reasonable
    headerHistoryRef.current[id] = headerHistoryRef.current[id].filter(
      entry => now - entry.timestamp <= maxHistoryMs
    );
    
    const history = headerHistoryRef.current[id];
    
    // THRESHOLD ALERT CHECK
    if (headerThreshold !== null && headerThreshold !== undefined) {
      // Check if all values within alert duration window are below threshold
      const thresholdCheckTime = now - headerAlertDuration;
      const relevantHistory = history.filter(entry => entry.timestamp >= thresholdCheckTime);
      
      // Only check if we have enough history to cover the duration
      const haveEnoughHistory = relevantHistory.length > 0 && 
        (relevantHistory[0].timestamp <= thresholdCheckTime + actualPollingInterval * 1.5);
      
      if (haveEnoughHistory) {
        const allBelowThreshold = relevantHistory.every(entry => entry.value < headerThreshold);
        
        if (allBelowThreshold) {
          if (DEBUG_MODE) {
            console.log(`Triggering threshold alert for ${name}: All values below ${headerThreshold} for ${headerAlertDuration/1000}s`);
          }
          
          // Create threshold alert
          setAlerts(prev => {
            const existingAlert = prev.find(a => a.headerId === id && a.type === "threshold");
            if (existingAlert) {
              return prev.map(a => 
                a.headerId === id && a.type === "threshold"
                  ? { ...a, value, timestamp: now }
                  : a
              );
            }
            return [...prev, {
              id: `threshold-${id}-${now}`,
              headerId: id,
              headerName: name,
              type: "threshold",
              category: category.category,
              value,
              threshold: headerThreshold,
              timestamp: now,
              duration: headerAlertDuration / 1000,
              stageId,
              projectId
            }];
          });
        }
      }
    }
    
    // FROZEN DATA ALERT CHECK
    if (history.length > 1) {
      const firstValue = history[0].value;
      const allSameValue = history.every(entry => entry.value === firstValue);
      
      // Check if we have enough history to cover the frozen duration
      const frozenCheckTime = now - headerFrozenThreshold;
      const oldestEntry = history[0];
      
      const haveEnoughFrozenHistory = oldestEntry.timestamp <= frozenCheckTime + actualPollingInterval * 1.5;
      
      if (allSameValue && haveEnoughFrozenHistory) {
        if (DEBUG_MODE) {
          console.log(`Triggering frozen alert for ${name}: Value ${firstValue} frozen for ${headerFrozenThreshold/1000}s`);
        }
        
        // Create frozen data alert
        setAlerts(prev => {
          const existingAlert = prev.find(a => a.headerId === id && a.type === "frozen");
          if (existingAlert) return prev;
          return [...prev, {
            id: `frozen-${id}-${now}`,
            headerId: id,
            headerName: name,
            type: "frozen",
            value,
            timestamp: now,
            lastChangeTime: oldestEntry.timestamp,
            frozenDuration: headerFrozenThreshold / 1000,
            stageId,
            projectId
          }];
        });
      }
    }
  }, [getHeaderCategory, thresholds, headerContinuity, headerValues, frozenDataThreshold, actualPollingInterval, settings, activeStageIds]);

  // Start monitoring a header
  const startMonitoring = useCallback((header, stageId) => {
    if (!header?.id) return;
    
    // Enhance header with stageId and projectId if available
    const enhancedHeader = { 
      ...header, 
      stageId,
      projectId: header.projectId || null
    };
    
    setMonitoredHeaders(prev => {
      // Check if header is already monitored
      const existingHeader = prev.find(h => h.id === header.id);
      if (existingHeader) {
        // Update stage mapping
        return prev.map(h => 
          h.id === header.id 
            ? { ...enhancedHeader, lastStageId: h.stageId }
            : h
        );
      }
      // Add new header
      return [...prev, enhancedHeader];
    });

    setHeaderContinuity(prev => ({
      ...prev,
      [header.id]: {
        ...(prev[header.id] || {}),
        stages: [...(prev[header.id]?.stages || []), stageId],
        currentStageId: stageId
      }
    }));

    // Initialize history for the header
    headerHistoryRef.current[header.id] = [];
    
    if (DEBUG_MODE) {
      console.log(`Started monitoring header ${header.id} (${header.name}) for stage ${stageId}`);
    }
    
    setIsMonitoring(true);
  }, []);

  // Stop monitoring a header
  const stopMonitoring = useCallback((headerId) => {
    // Get header details before removing for logging
    const headerToRemove = monitoredHeaders.find(h => h.id === headerId);
    
    setMonitoredHeaders(prev => prev.filter(h => h.id !== headerId));
    setHeaderValues(prev => {
      const newValues = { ...prev };
      delete newValues[headerId];
      return newValues;
    });
    
    // Clean up history
    delete headerHistoryRef.current[headerId];
    
    // Clean up continuity
    setHeaderContinuity(prev => {
      const newContinuity = { ...prev };
      delete newContinuity[headerId];
      return newContinuity;
    });
    
    // Remove any alerts for this header
    setAlerts(prev => prev.filter(a => a.headerId !== headerId));
    
    if (headerToRemove && DEBUG_MODE) {
      console.log(`Stopped monitoring header ${headerId} (${headerToRemove.name})`);
    }
  }, [monitoredHeaders]);

  // Dismiss an alert
  const dismissAlert = useCallback((alertId) => {
    setAlerts(prev => prev.filter(a => a.id !== alertId));
  }, []);

  // Clear all alerts
  const clearAllAlerts = useCallback(() => {
    setAlerts([]);
  }, []);

  // Polling effect
  useEffect(() => {
    const fetchValues = async () => {
      if (!monitoredHeaders.length) return;
      setLoading(true);
      setError(null);

      try {
        const results = await Promise.all(
          monitoredHeaders.map(async header => {
            try {
              const response = await api.get(`/stages/datum/${header.id}`);
              
              // Check if this header response indicates it's no longer valid
              if (isHeaderResponseInvalid(response)) {
                if (DEBUG_MODE) {
                  console.log(`Header ${header.id} (${header.name}) appears to be invalid, will stop monitoring`);
                }
                // Schedule a cleanup for this header after this cycle completes
                setTimeout(() => stopMonitoring(header.id), 0);
                return { 
                  id: header.id, 
                  value: null,
                  error: 'Invalid header',
                  timestamp: Date.now(),
                  stageId: header.stageId,
                  projectId: header.projectId
                };
              }
              
              const value = response?.data?.value;
              
              if (value !== undefined) {
                checkAlerts(header, value);
              }

              return { 
                id: header.id, 
                value, 
                timestamp: Date.now(),
                stageId: header.stageId,
                projectId: header.projectId
              };
            } catch (err) {
              console.error(`Error fetching value for header ${header.id}:`, err);
              
              // If API error indicates the header might not exist anymore, remove it
              if (err.response && (err.response.status === 404 || err.response.status === 400)) {
                if (DEBUG_MODE) {
                  console.log(`Header ${header.id} not found or invalid, will stop monitoring`);
                }
                // Schedule a cleanup for this header
                setTimeout(() => stopMonitoring(header.id), 0);
              }
              
              return { 
                id: header.id, 
                error: err.message, 
                timestamp: Date.now(),
                stageId: header.stageId,
                projectId: header.projectId
              };
            }
          })
        );

        setHeaderValues(prev => {
          const newValues = { ...prev };
          results.forEach(result => {
            if (result.id) {
              newValues[result.id] = result;
            }
          });
          return newValues;
        });
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (isMonitoring && monitoredHeaders.length > 0) {
      fetchValues();
      intervalRef.current = setInterval(fetchValues, actualPollingInterval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isMonitoring, monitoredHeaders, actualPollingInterval, api, checkAlerts, stopMonitoring, isHeaderResponseInvalid]);

  return {
    monitoredHeaders,
    headerValues,
    alerts,
    isMonitoring,
    loading,
    error,
    startMonitoring,
    stopMonitoring,
    dismissAlert,
    clearAllAlerts,
    headerContinuity
  };
}
