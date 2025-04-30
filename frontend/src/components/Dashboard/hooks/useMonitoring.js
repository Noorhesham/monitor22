// Simplified useMonitoring Hook Stub
// This hook no longer performs active monitoring on the client-side.
// It might be removed entirely later if state is managed in Dashboard.jsx

import { useState, useEffect, useCallback, useRef } from "react";
import useApi from "./useApi";
import { DEFAULT_SETTINGS } from "../../../schemas/settings.js";

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
  pollingInterval = DEFAULT_SETTINGS.pollingInterval * 1000,
  frozenDataThreshold = DEFAULT_SETTINGS.patternCategories.pressure.frozenThreshold * 1000,
  getHeaderCategory,
  thresholds = {}
} = {}) {
  const api = useApi();

  // State
  const [monitoredHeaders, setMonitoredHeaders] = useState([]);
  const [headerValues, setHeaderValues] = useState({});
  const [alerts, setAlerts] = useState([]);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [headerContinuity, setHeaderContinuity] = useState({});

  // Refs for tracking
  const intervalRef = useRef(null);
  const lastUpdateRef = useRef({});
  const alertStateRef = useRef({});

  // API URL for monitoring status
  const API_URL = useRef(process.env.MONITORING_API_BASE || 'http://localhost:3002/status');

  // Check for alerts based on header category and value
  const checkHeaderAlert = useCallback((header, value) => {
    if (!header || value === undefined) return;

    const { id, name, stageId } = header;
    
    // Skip if header is not being monitored
    if (!headerValues[id] || !headerValues[id].isMonitored) {
      return;
    }

    const continuity = headerContinuity[id];
    
    // Only create alerts for the current stage
    if (continuity && continuity.currentStageId !== stageId) {
      return;
    }

    const category = getHeaderCategory(name);
    if (!category) return;

    const threshold = thresholds[id] ?? category.threshold;
    if (threshold === null) return;

    const now = Date.now();
    const alertState = alertStateRef.current[id] || {
      startTime: now,
      isActive: false,
      category: category.category
    };

    // Check if value is below threshold
    if (value < threshold) {
      if (!alertState.isActive) {
        alertState.startTime = now;
        alertState.isActive = true;
        if (DEBUG_MODE) {
          console.log(`Starting alert timer for ${name}: Value ${value} < threshold ${threshold}`);
        }
      }

      const timeUnderThreshold = now - alertState.startTime;
      const alertDuration = category.alertDuration * 1000;

      if (timeUnderThreshold >= alertDuration) {
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
            threshold,
            timestamp: now,
            duration: alertDuration / 1000,
            stageId
          }];
        });
      }
    } else {
      if (alertState.isActive) {
        alertState.isActive = false;
        if (DEBUG_MODE) {
          console.log(`Resetting alert timer for ${name}: Value ${value} >= threshold ${threshold}`);
        }
      }
    }

    alertStateRef.current[id] = alertState;
  }, [getHeaderCategory, thresholds, headerContinuity, headerValues]);

  // Check for frozen data
  const checkFrozenData = useCallback((header, value) => {
    const { id, name, stageId } = header;
    
    // Skip if header is not being monitored
    if (!headerValues[id] || !headerValues[id].isMonitored) {
      return;
    }
    
    const continuity = headerContinuity[id];
    
    // Only check frozen data for current stage
    if (continuity && continuity.currentStageId !== stageId) {
      return;
    }

    const lastUpdate = lastUpdateRef.current[id];
    const now = Date.now();

    if (lastUpdate && value === headerValues[id]?.value) {
      const timeFrozen = now - lastUpdate;
      if (timeFrozen >= frozenDataThreshold) {
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
            lastChangeTime: lastUpdate,
            frozenDuration: frozenDataThreshold / 1000,
            stageId
          }];
        });
      }
    } else {
      lastUpdateRef.current[id] = now;
    }
  }, [frozenDataThreshold, headerValues, headerContinuity]);

  // Start monitoring a header
  const startMonitoring = useCallback((header, stageId) => {
    if (!header?.id) return;
    
    setMonitoredHeaders(prev => {
      // Check if header is already monitored
      const existingHeader = prev.find(h => h.id === header.id);
      if (existingHeader) {
        // Update stage mapping
        return prev.map(h => 
          h.id === header.id 
            ? { ...h, stageId, lastStageId: h.stageId }
            : h
        );
      }
      // Add new header
      return [...prev, { ...header, stageId }];
    });

    setHeaderContinuity(prev => ({
      ...prev,
      [header.id]: {
        ...(prev[header.id] || {}),
        stages: [...(prev[header.id]?.stages || []), stageId],
        currentStageId: stageId
      }
    }));

    setIsMonitoring(true);
  }, []);

  // Stop monitoring a header
  const stopMonitoring = useCallback((headerId) => {
    setMonitoredHeaders(prev => prev.filter(h => h.id !== headerId));
    setHeaderValues(prev => {
      const newValues = { ...prev };
      delete newValues[headerId];
      return newValues;
    });
    delete lastUpdateRef.current[headerId];
    delete alertStateRef.current[headerId];
    
    // Clean up continuity
    setHeaderContinuity(prev => {
      const newContinuity = { ...prev };
      delete newContinuity[headerId];
      return newContinuity;
    });
  }, []);

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
              const value = response?.data?.value;
              
              if (value !== undefined) {
                checkHeaderAlert(header, value);
                checkFrozenData(header, value);
              }

              return { 
                id: header.id, 
                value, 
                timestamp: Date.now(),
                stageId: header.stageId
              };
            } catch (err) {
              console.error(`Error fetching value for header ${header.id}:`, err);
              return { 
                id: header.id, 
                error: err.message, 
                timestamp: Date.now(),
                stageId: header.stageId
              };
            }
          })
        );

        setHeaderValues(prev => {
          const newValues = { ...prev };
          results.forEach(result => {
            newValues[result.id] = result;
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
      intervalRef.current = setInterval(fetchValues, pollingInterval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isMonitoring, monitoredHeaders, pollingInterval, api, checkHeaderAlert, checkFrozenData]);

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
