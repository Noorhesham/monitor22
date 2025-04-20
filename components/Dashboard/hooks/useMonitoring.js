import { useState, useEffect, useCallback, useRef } from "react";
import useApi from "./useApi";
import { matchPatterns } from "../utils/patterns";

// Debug flag to track issues
const DEBUG_MODE = false;

const DEFAULT_CONFIG = {
  POLLING_INTERVAL: 5000,
  ALERT_DURATION: 120000,
  FROZEN_THRESHOLD: 60000,
};

/**
 * Custom hook for monitoring header values and managing alerts
 * @param {Object} options Configuration options
 * @param {number} options.pollingInterval Interval in ms for polling header values (default: 10000)
 * @param {number} options.frozenDataThreshold Threshold in seconds to consider data frozen (default: 60)
 * @returns {Object} Monitoring state and functions
 */
export default function useMonitoring({
  pollingInterval = DEFAULT_CONFIG.POLLING_INTERVAL,
  frozenDataThreshold = DEFAULT_CONFIG.FROZEN_THRESHOLD,
} = {}) {
  const api = useApi();

  // State for monitoring
  const [monitoredHeaders, setMonitoredHeaders] = useState([]);
  const [headerValues, setHeaderValues] = useState({});
  const [alerts, setAlerts] = useState([]);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Ref to store the interval ID for polling
  const intervalRef = useRef(null);
  // Ref to track last update times for frozen data detection
  const lastUpdateRef = useRef({});
  const breachStartTimesRef = useRef({});
  // Add these refs and effect
  const monitoredHeadersRef = useRef(monitoredHeaders);

  useEffect(() => {
    monitoredHeadersRef.current = monitoredHeaders;
  }, [monitoredHeaders]); // Sync ref on state change
  /**
   * Check if a header's value should trigger an alert
   * @param {Object} header Header object
   * @param {any} value The current value
   */
  // Add this ref to track breach start times

  const checkHeaderAlert = useCallback((header, value) => {
    if (!header || value === undefined) return;

    const { id, threshold, thresholdType = "below", name } = header;
    const currentTime = Date.now();

    // Skip if no threshold set
    if (threshold === undefined || threshold === null) return;

    // Convert values to numbers
    const numericThreshold = parseFloat(threshold);
    const numericValue = parseFloat(value);

    // Validate numbers
    if (isNaN(numericThreshold) || isNaN(numericValue)) return;

    // Determine if currently breaching threshold
    const isBreaching = numericValue < numericThreshold;
    console.log(isBreaching, numericThreshold, numericValue);
    // Handle threshold breach timing
    if (isBreaching) {
      if (!breachStartTimesRef.current[id]) {
        // Start timing the breach
        breachStartTimesRef.current[id] = currentTime;
        console.log(`[${new Date().toISOString()}] 🟡 STARTED monitoring breach for ${name} (ID: ${id})`);
        if (DEBUG_MODE) console.log(`Threshold breach started for ${name} at ${currentTime}`);
      } else {
        // Check if breach has lasted 2 minutes
        const breachDuration = currentTime - breachStartTimesRef.current[id];
        const breachDurationMinutes = (breachDuration / 60000).toFixed(2);

        console.log(
          `[${new Date().toISOString()}] 🔴 ${name} has been breaching for ${breachDurationMinutes} minutes`,
          {
            headerId: id,
            currentValue: numericValue,
            threshold: numericThreshold,
            breachStart: new Date(breachStartTimesRef.current[id]).toISOString(),
            currentTime: new Date(currentTime).toISOString(),
          }
        );

        if (breachDuration >= DEFAULT_CONFIG.ALERT_DURATION) {
          console.log(`[${new Date().toISOString()}] 🚨 ALERT TRIGGERED: ${name} breached threshold for 2+ minutes`);
          setAlerts((prev) => {
            const existing = prev.find((a) => a.headerId === id && a.type === "threshold" && !a.resolved);

            if (!existing) {
              return [
                ...prev,
                {
                  id: `threshold-${id}-${currentTime}`,
                  headerId: id,
                  headerName: name,
                  type: "threshold",
                  message: `${name} stayed ${thresholdType} threshold for 2 minutes`,
                  value: numericValue,
                  threshold: numericThreshold,
                  thresholdType,
                  timestamp: currentTime,
                  resolved: false,
                },
              ];
            }

            // Update existing alert
            return prev.map((a) =>
              a.id === existing.id
                ? {
                    ...a,
                    value: numericValue,
                    timestamp: currentTime,
                  }
                : a
            );
          });
        }
      }
    } else {
      // Reset timer if value recovers
      if (breachStartTimesRef.current[id]) {
        if (DEBUG_MODE)
          console.log(`Threshold breach ended for ${name} after ${currentTime - breachStartTimesRef.current[id]}ms`);
        const breachDurationMs = currentTime - breachStartTimesRef.current[id];
        const breachDurationMinutes = (breachDurationMs / 60000).toFixed(2);

        console.log(
          `[${new Date().toISOString()}] 🟢 RECOVERED: ${name} returned to normal after ${breachDurationMinutes} minutes`,
          {
            headerId: id,
            finalValue: numericValue,
            threshold: numericThreshold,
          }
        );

        // Mark existing alert as resolved
        setAlerts((prev) =>
          prev.map((a) =>
            a.headerId === id && a.type === "threshold" && !a.resolved
              ? { ...a, resolved: true, resolvedAt: currentTime }
              : a
          )
        );

        delete breachStartTimesRef.current[id];
      }
    }
  }, []);

  /**
   * Check for frozen data based on the last update times
   * @param {number} currentTime Current timestamp
   */
  // Add this ref to track frozen start times
  // Add this ref to track previous values
  const previousValuesRef = useRef({});
  const frozenAlertsRef = useRef({});
  const checkFrozenData = useCallback(
    (currentTime) => {
      Object.entries(headerValues).forEach(([headerId, headerData]) => {
        const header = monitoredHeadersRef.current.find((h) => h.id.toString() === headerId.toString());

        if (!header || !headerData) return;

        const currentValue = headerData.value;
        const previousEntry = previousValuesRef.current[headerId];
        console.log(currentValue, previousEntry);
        // Initialization logic
        if (!previousEntry) {
          previousValuesRef.current[headerId] = {
            value: currentValue,
            timestamp: currentTime,
            alertTriggered: false,
          };
          return;
        }

        // Value changed - reset tracking
        if (currentValue !== previousEntry.value) {
          previousValuesRef.current[headerId] = {
            value: currentValue,
            timestamp: currentTime,
            alertTriggered: false,
          };

          if (frozenAlertsRef.current[headerId]) {
            setAlerts((prev) => prev.filter((a) => a.id !== frozenAlertsRef.current[headerId]));
            delete frozenAlertsRef.current[headerId];
          }
          return;
        }

        // Check frozen duration
        const frozenDuration = currentTime - previousEntry.timestamp;
        if (frozenDuration >= DEFAULT_CONFIG.FROZEN_THRESHOLD && !previousEntry.alertTriggered) {
          const alertId = `frozen-${headerId}-${currentTime}`;

          setAlerts((prev) => [
            ...prev,
            {
              id: alertId,
              headerId,
              headerName: header.name,
              type: "frozen",
              message: `${header.name} value unchanged for ${(frozenDuration / 60000).toFixed(2) } minutes`,
              timestamp: currentTime,
              resolved: false,
              value: currentValue,
            },
          ]);

          previousValuesRef.current[headerId].alertTriggered = true;
          frozenAlertsRef.current[headerId] = alertId;
        }
      });
    },
    [headerValues]
  );

  /**
   * Fetch a single header value
   * @param {Object} header The header object to fetch
   */
  useEffect(() => {
    checkFrozenData(Date.now());
  }, [headerValues, checkFrozenData]);
  const fetchSingleHeaderValue = async (header) => {
    console.log(monitoredHeaders, headerValues);

    if (!header || !header.id) {
      console.error("Cannot fetch value for invalid header:", header);
      return null;
    }

    if (DEBUG_MODE) console.log(`[fetchSingleHeaderValue] Fetching for Header ID: ${header.id}, Name: ${header.name}`);

    const { id, name } = header;
    const currentTime = Date.now();

    try {
      // Construct the API endpoint
      const endpoint = `/stages/datum/${id}`;

      if (DEBUG_MODE) console.log(`Fetching value for ${name} from endpoint: ${endpoint}`);

      const { data } = await api.get(endpoint);
      //&& typeof response.value !== "undefined"
      console.log(`the data we recieved is ${data}`);
      if (data.id) {
        if (DEBUG_MODE) console.log(`Received value for ${name} with id ${id}:`, data);

        // Update value in the state
        const value = data.data[data.data.length - 1];
        setHeaderValues((prev) => ({
          ...prev,
          [id]: {
            // ✅ Uses header's actual ID as key
            value: value,
            timestamp: currentTime,
            header: header,
          },
        }));

        console.log(`the data we recieved is ${value} and we are comparing to threshold ${header.threshold}`);
        // Update last update time for this header
        lastUpdateRef.current[id] = currentTime;

        // Check for threshold alerts
        checkHeaderAlert(header, value);
        return data.data;
      }
    } catch (err) {
      console.error(`Error fetching value for ${name}:`, err);
      // Set error state in the values
      setHeaderValues((prev) => ({
        ...prev,
        [id]: {
          value: null,
          timestamp: currentTime,
          header: header,
          error: true,
          errorMessage: err.message,
        },
      }));

      return null;
    }
  };

  /**
   * Start monitoring a single header
   * @param {Object} header Header object to monitor with {id, name, projectId}
   */
  // i start ssingle
  const startMonitoring = useCallback(
    (header) => {
      if (!header?.id) return;
      setMonitoredHeaders((prevHeaders) => {
        // Prevent duplicates
        if (prevHeaders.some((h) => h.id === header.id)) return prevHeaders;

        // Immediately fetch new header
        fetchSingleHeaderValue(header);

        // Start interval if first header
        if (prevHeaders.length === 0) {
          intervalRef.current = setInterval(() => {
            monitoredHeadersRef.current.forEach(fetchSingleHeaderValue);
          }, pollingInterval);
          setIsMonitoring(true);
        }

        // Return updated headers
        return [...prevHeaders, header];
      });
    },
    [fetchSingleHeaderValue, pollingInterval]
  );
  /**
   * Stop monitoring a specific header by ID
   * @param {string|number} headerId ID of the header to stop monitoring
   */
  const stopMonitoring = useCallback((headerId) => {
    if (DEBUG_MODE) console.log("Stopping monitoring for header ID:", headerId);
    delete breachStartTimesRef.current[headerId];
    delete previousValuesRef.current[headerId];
    delete frozenAlertsRef.current[headerId];

    setMonitoredHeaders((current) => {
      const updatedHeaders = current.filter((h) => h.id !== headerId);

      // If no more headers to monitor, clear the interval
      if (updatedHeaders.length === 0) {
        if (DEBUG_MODE) console.log("No more headers to monitor, clearing interval");
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        setIsMonitoring(false);
      }

      return updatedHeaders;
    });
  }, []);

  /**
   * Dismiss a specific alert
   * @param {string} alertId ID of the alert to dismiss
   */
  const dismissAlert = useCallback((alertId) => {
    setAlerts((prev) => prev.filter((alert) => alert.id !== alertId));
  }, []);

  /**
   * Clear all alerts
   */
  const clearAllAlerts = useCallback(() => {
    setAlerts([]);
  }, []);

  // Clean up interval on unmount
  useEffect(() => {
    return () => {
      if (DEBUG_MODE) console.log("Cleaning up monitoring interval on unmount");
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

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
  };
}
