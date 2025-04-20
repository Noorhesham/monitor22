import { useState, useEffect, useCallback, useRef } from "react";
import useApi from "./useApi";
import { matchPatterns } from "../utils/patterns";

// Debug flag to track issues
const DEBUG_MODE = false;

// Special endpoint that's known to be problematic
const PROBLEM_ENDPOINT_PATTERN = "/header";

// Disable mock values - use real API data
const MOCK_HEADER_VALUES = {};

/**
 * Custom hook for monitoring header values and managing alerts
 * @param {Object} options Configuration options
 * @param {number} options.pollingInterval Interval in ms for polling header values (default: 10000)
 * @param {number} options.frozenDataThreshold Threshold in seconds to consider data frozen (default: 60)
 * @returns {Object} Monitoring state and functions
 */
export default function useMonitoring({ pollingInterval = 10000, frozenDataThreshold = 60 } = {}) {
  const api = useApi();

  // State for monitoring
  const [monitoredHeaders, setMonitoredHeaders] = useState([]);
  const [headerValues, setHeaderValues] = useState({});
  const [alerts, setAlerts] = useState([]);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isFrozen, setIsFrozen] = useState([]);
  const [isBelow, setIsBelow] = useState([]);

  // Ref to store the interval ID for polling
  const intervalRef = useRef(null);
  // Ref to track last update times for frozen data detection
  const lastUpdateRef = useRef({});

  /**
   * Check if a header's value should trigger an alert
   * @param {Object} header Header object
   * @param {any} value The current value
   */
  const checkHeaderAlert = useCallback((header, value) => {
    if (!header || value === undefined) return;

    const { id, threshold, thresholdType = "below", name } = header;

    // Skip if no threshold is set
    if (threshold === undefined || threshold === null) return;

    // Convert threshold to a number
    const numericThreshold = parseFloat(threshold);
    if (isNaN(numericThreshold)) {
      if (DEBUG_MODE) console.log(`Invalid threshold value for ${name}: ${threshold}`);
      return;
    }

    // Convert value to a number
    const numericValue = parseFloat(value);
    if (isNaN(numericValue)) {
      if (DEBUG_MODE) console.log(`Invalid value for ${name}: ${value} bt ${thresholdType}`);
      return;
    }

    let isAlertTriggered = false;
    console.log(`we are comparing ${numericValue} to ${numericThreshold}`);
    // Check threshold based on type
    if (thresholdType === "above" && numericValue > numericThreshold) {
      isAlertTriggered = true;
      if (DEBUG_MODE) console.log(`ALERT: ${name} value ${numericValue} exceeds threshold ${numericThreshold}`);
    } else if (thresholdType === "below" && numericValue < numericThreshold) {
      isAlertTriggered = true;
      if (DEBUG_MODE) console.log(`ALERT: ${name} value ${numericValue} below threshold ${numericThreshold}`);
    }

    if (isAlertTriggered) {
      // Check if this alert already exists
      setAlerts((prev) => {
        const existingAlertIndex = prev.findIndex((a) => a.headerId === id && a.type === "threshold");

        if (existingAlertIndex >= 0) {
          // Alert already exists, update it
          const updatedAlerts = [...prev];
          updatedAlerts[existingAlertIndex] = {
            ...updatedAlerts[existingAlertIndex],
            value: numericValue,
            timestamp: Date.now(),
          };
          return updatedAlerts;
        } else {
          // Create new alert
          return [
            ...prev,
            {
              id: `threshold-${id}-${Date.now()}`,
              headerId: id,
              headerName: header.name,
              type: "threshold",
              message: `${header.name} ${
                thresholdType === "above" ? "exceeded" : "fell below"
              } threshold (${numericThreshold})`,
              value: numericValue,
              threshold: numericThreshold,
              thresholdType,
              timestamp: Date.now(),
            },
          ];
        }
      });
    }
  }, []);

  /**
   * Check for frozen data based on the last update times
   * @param {number} currentTime Current timestamp
   */
  const checkFrozenData = useCallback(
    (currentTime) => {
      const frozenThresholdMs = frozenDataThreshold * 1000;

      // Skip if no data has been collected yet
      if (Object.keys(lastUpdateRef.current).length === 0) return;

      Object.entries(lastUpdateRef.current).forEach(([headerId, lastUpdate]) => {
        // Check if the data is older than the threshold

        if (currentTime - lastUpdate > frozenThresholdMs) {
          const header = monitoredHeaders.find((h) => h.id === headerId);

          if (!header) return;

          // Check if this frozen alert already exists
          setAlerts((prev) => {
            const existingAlertIndex = prev.findIndex((a) => a.headerId === headerId && a.type === "frozen");

            if (existingAlertIndex >= 0) {
              // Alert already exists, no need to update
              return prev;
            } else {
              // Create new frozen data alert
              return [
                ...prev,
                {
                  id: `frozen-${headerId}-${Date.now()}`,
                  headerId,
                  headerName: header.name,
                  type: "frozen",
                  message: `${header.name} data is frozen (no updates for over ${frozenDataThreshold} seconds)`,
                  timestamp: Date.now(),
                },
              ];
            }
          });
        }
      });
    },
    [monitoredHeaders, frozenDataThreshold]
  );

  /**
   * Fetch a single header value
   * @param {Object} header The header object to fetch
   */
  const fetchSingleHeaderValue = async (header) => {
    console.log(monitoredHeaders, header);

    if (!header || !header.id || !header.projectId) {
      console.warn("Cannot fetch value for invalid header:", header);
      return null;
    }

    if (DEBUG_MODE) console.log(`[fetchSingleHeaderValue] Fetching for Header ID: ${header.id}, Name: ${header.name}`);

    const { id, projectId, name } = header;
    const currentTime = Date.now();

    try {
      // Construct the API endpoint
      const endpoint = `/stages/datum/${id}`;

      // Check if this is a known problematic endpoint
      const isProblematicEndpoint = endpoint.includes(PROBLEM_ENDPOINT_PATTERN);

      if (isProblematicEndpoint && MOCK_HEADER_VALUES[id] !== undefined) {
        if (DEBUG_MODE) console.log(`Using mock data for ${name} (ID: ${id}) due to known API issue`);

        // Use mock data for known problematic endpoints
        const mockValue = MOCK_HEADER_VALUES[id];

        // Update value in the state
        setHeaderValues((prev) => ({
          ...prev,
          [id]: {
            value: mockValue,
            timestamp: currentTime,
            header: header,
            isMocked: true,
          },
        }));

        // Update last update time for this header
        lastUpdateRef.current[id] = currentTime;

        // Check for threshold alerts using the mock value
        checkHeaderAlert(header, mockValue);

        return mockValue;
      }

      if (DEBUG_MODE) console.log(`Fetching value for ${name} from endpoint: ${endpoint}`);

      const { data } = await api.get(endpoint);

      //&& typeof response.value !== "undefined"
      if (data) {
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
      } else {
        // If we get here, the API returned a 200 but no value - use a mock value if available
        if (MOCK_HEADER_VALUES[id] !== undefined) {
          const mockValue = MOCK_HEADER_VALUES[id];
          if (DEBUG_MODE) console.log(`Using fallback mock value for ${name} (ID: ${id}):`, mockValue);

          setHeaderValues((prev) => ({
            ...prev,
            [id]: {
              value: mockValue,
              timestamp: currentTime,
              header: header,
              isMocked: true,
            },
          }));

          lastUpdateRef.current[id] = currentTime;
          checkHeaderAlert(header, mockValue);
          return mockValue;
        }

        throw new Error(`No value returned for ${name}`);
      }
    } catch (err) {
      console.error(`Error fetching value for ${name}:`, err);

      // If we encounter an error, try to use a mock value if available
      if (MOCK_HEADER_VALUES[id] !== undefined) {
        const mockValue = MOCK_HEADER_VALUES[id];
        if (DEBUG_MODE) console.log(`Using mock value for ${name} (ID: ${id}) after API error:`, mockValue);

        setHeaderValues((prev) => ({
          ...prev,
          [id]: {
            value: mockValue,
            timestamp: currentTime,
            header: header,
            isMocked: true,
            error: false,
          },
        }));

        lastUpdateRef.current[id] = currentTime;
        checkHeaderAlert(header, mockValue);
        return mockValue;
      }

      // Set error state in the values if no mock value available
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
   * Fetch values for all monitored headers
   */
  const fetchHeaderValues = useCallback(async () => {
    console.log(monitoredHeaders);
    if (!monitoredHeaders.length) return;

    if (DEBUG_MODE)
      console.log(
        `[fetchHeaderValues] Starting fetch cycle for ${
          monitoredHeaders.length
        } headers at ${new Date().toLocaleTimeString()}`
      );

    setLoading(true);
    setError(null);

    try {
      // For each monitored header, fetch its value
      const fetchPromises = monitoredHeaders.map((header) => fetchSingleHeaderValue(header));
      // Wait for all fetches to complete
      const res = await Promise.all(fetchPromises);
      console.log(
        res.map((v) => v[v.length - 1]),
        "the data of all fetched headers "
      ); //shoowing them every time
      // Check for frozen data across all headers
      const currentTime = Date.now();
      checkFrozenData(currentTime);
    } catch (err) {
      setError("Failed to fetch header values: " + (err.message || "Unknown error"));
      console.error("Error fetching header values:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Start monitoring a single header
   * @param {Object} header Header object to monitor with {id, name, projectId}
   */
  // i start ssingle
  const startMonitoring = useCallback(
    (header) => {
      if (!header || !header.id) {
        console.error("Cannot start monitoring: Invalid header", header);
        return;
      }

      if (DEBUG_MODE) console.log("[startMonitoring] Attempting to monitor header:", header.name, header.id);

      // Make sure we have the projectId which is essential for monitoring
      if (!header.projectId) {
        console.error("Cannot monitor header without projectId:", header);
        return;
      }
      /**
        i will check if the first header i will fetch it then i will set an interval to refetch all ehaders over and over again 
       * 
       * 
       */
      // Add this header to the monitored headers if not already there
      setMonitoredHeaders((current) => {
        // Check if this header is already being monitored
        const exists = current.some((h) => h.id === header.id);
        if (exists) return current;
        // Add the new header to the monitored list
        const updatedHeaders = [...current, header];

        // Only start interval if this is the first header
        if (current.length === 0) {
          if (DEBUG_MODE) console.log(`[startMonitoring] Setting up polling interval (${pollingInterval}ms)`);

          // Fetch values immediately for the first time
          setTimeout(() => {
            // Fetch just this header immediately
            fetchSingleHeaderValue(header);

            // Set up interval for all headers
            if (!intervalRef.current) {
              intervalRef.current = setInterval(() => {
                if (DEBUG_MODE)
                  console.log(`[Interval Tick] Firing fetchHeaderValues at ${new Date().toLocaleTimeString()}`);
                fetchHeaderValues();
              }, pollingInterval);
              setIsMonitoring(true);
            }
          }, 0);
        } else {
          // If headers are already being monitored, fetch just this one right away
          if (DEBUG_MODE)
            console.log(`[startMonitoring] Setting up polling interval for only one (${pollingInterval}ms)`);

          setTimeout(() => fetchSingleHeaderValue(header), 0);
        }

        return updatedHeaders;
      });
    },
    [fetchSingleHeaderValue, fetchHeaderValues, pollingInterval]
  );

  /**
   * Stop monitoring a specific header by ID
   * @param {string|number} headerId ID of the header to stop monitoring
   */
  const stopMonitoring = useCallback((headerId) => {
    if (DEBUG_MODE) console.log("Stopping monitoring for header ID:", headerId);

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
