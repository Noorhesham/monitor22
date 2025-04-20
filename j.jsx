import React, { useState, useCallback, useEffect } from "react";
import { AlertCircle, EyeIcon, BellIcon, CheckSquare, Square, Play, Pause, X } from "lucide-react";
import { useSettings } from "./contexts/SettingsContext.jsx";
// Import Hooks
import useStageData from "./components/Dashboard/hooks/useStageData";
import useMonitoring from "./components/Dashboard/hooks/useMonitoring";
// Import Utils
import { matchPatterns } from "./components/Dashboard/utils/patterns";

// Debug mode
const DEBUG_MODE = true;

// Component renamed to Dashboard
export default function Dashboard() {
  const settings = useSettings();
  // Destructure only necessary settings for this component
  const {
    positivePatterns,
    negativePatterns,
    isLoadingSettings,
    settingsError,
    pollingIntervalSeconds,
    frozenDataThresholdSeconds,
  } = settings;

  // --- Local UI State (Keep) ---
  const [filter, setFilter] = useState("positive"); // State for header filtering UI (positive, negative, all)
  const [selectedHeaders, setSelectedHeaders] = useState({}); // { projectId: Set<headerId> } - Headers selected by the user *for potential* monitoring
  const [thresholds, setThresholds] = useState({}); // { projectId: { headerId: number | '' } } - User-defined thresholds
  const [projectMonitoringStatus, setProjectMonitoringStatus] = useState({}); // { projectId: boolean } - Tracks if user clicked 'Start Monitoring'

  // --- Stage Data Hook ---
  const {
    displayStages, // Stages to render [{ projectId, stageId, projectName, ...}]
    headersByStage, // Headers keyed by stageId { stageId: [ {id, name, stageId, ...} ] }
    loading: isLoadingStages, // Loading state for stages/headers
    error: stagesError, // Error state from fetching stages/headers
    refreshData: refreshStageData, // Function to refresh stage/header data
  } = useStageData(settings); // Pass full settings object
  // --- Monitoring Hook with correct settings ---
  const pollingInterval = pollingIntervalSeconds ? pollingIntervalSeconds * 1000 : 10000;
  const frozenDataThreshold = frozenDataThresholdSeconds || 60;

  const {
    monitoredHeaders, // Actively monitored headers {id, name}[]
    headerValues, // Current values { headerId: { value, timestamp, lastUpdated, error? } }
    alerts: monitoringAlerts, // Active alerts from the hook [{ id, headerId, headerName, type, message, value?, timestamp }]
    // loading: isLoadingMonitoring, // Using isLoadingStages for now
    error: monitoringError, // Error state specific to monitoring fetches
    startMonitoring, // Function to add a header {id, name} to monitoring list
    stopMonitoring, // Function to remove a header by ID from monitoring list
    dismissAlert, // Function to dismiss a specific alert by ID
    clearAllAlerts, // Function to clear all alerts
  } = useMonitoring({
    pollingInterval,
    frozenDataThreshold,
  });

  // --- Combined Loading/Error State ---
  const isLoading = isLoadingSettings || isLoadingStages;
  const error = settingsError || stagesError || monitoringError;

  // Track what's being monitored
  useEffect(() => {
    if (DEBUG_MODE) {
      console.log("Currently monitoring headers:", monitoredHeaders.length);
    }
  }, [monitoredHeaders]);
  // --- Handlers ---

  // Handles selecting/deselecting a header checkbox for a project
  const handleHeaderSelect = useCallback((projectId, headerId) => {
    if (DEBUG_MODE) console.log(`Toggling header selection: projectId=${projectId}, headerId=${headerId}`);

    setSelectedHeaders((prevSelected) => {
      const currentProjectSelection = prevSelected[projectId] ? new Set(prevSelected[projectId]) : new Set();
      const isCurrentlySelected = currentProjectSelection.has(headerId);
      const nextProjectSelection = new Set(currentProjectSelection);

      if (isCurrentlySelected) {
        nextProjectSelection.delete(headerId);
      } else {
        nextProjectSelection.add(headerId);
      }

      // Update thresholds based on the *next* selection state
      setThresholds((prevThresholds) => {
        const currentProjectThresholds = prevThresholds[projectId] || {};
        let nextProjectThresholds = { ...currentProjectThresholds };

        if (isCurrentlySelected) {
          // Header was deselected
          delete nextProjectThresholds[headerId];
          if (Object.keys(nextProjectThresholds).length === 0) {
            // Remove project entry if no headers left
            const { [projectId]: _, ...rest } = prevThresholds;
            return rest;
          }
        } else {
          // Header was selected
          if (nextProjectThresholds[headerId] === undefined) {
            nextProjectThresholds[headerId] = ""; // Default threshold if newly selected
          }
        }
        return { ...prevThresholds, [projectId]: nextProjectThresholds };
      });

      return { ...prevSelected, [projectId]: nextProjectSelection };
    });
  }, []); // Removed thresholds from dependency array

  // Handles changing the threshold value for a selected header
  const handleThresholdChange = useCallback((projectId, headerId, value) => {
    const numericValue = Number(value);
    setThresholds((prev) => ({
      ...prev,
      [projectId]: {
        ...(prev[projectId] || {}), // Ensure project object exists
        [headerId]: value === "" ? "" : isNaN(numericValue) ? prev[projectId]?.[headerId] ?? "" : numericValue,
      },
    }));
  }, []); // No dependencies needed here

  // Handles toggling monitoring ON/OFF for an entire project
  // Note: Dependencies adjusted to be less likely to cause loops
  // لل stage كامله
  const handleMonitoringToggle = useCallback(
    (projectId, stageId) => {
      const isCurrentlyActive = projectMonitoringStatus[projectId];
      const currentProjectSelection = selectedHeaders[projectId] || new Set();
      const currentProjectThresholds = thresholds[projectId] || {};
      const stageHeadersDetails = headersByStage[stageId] || [];

      // Get the fully detailed header objects that are selected
      const selectedHeaderObjects = stageHeadersDetails
        .filter((h) => currentProjectSelection.has(h.id))
        .map((h) => ({
          id: h.id,
          name: h.name,
          projectId,
          threshold: currentProjectThresholds[h.id] ?? null, // Use current thresholds directly
          thresholdType: "below", // Default
        }));

      if (isCurrentlyActive) {
        if (DEBUG_MODE)
          console.log(`Stopping monitoring for project ${projectId}, ${selectedHeaderObjects.length} headers`);
        selectedHeaderObjects.forEach((header) => stopMonitoring(header.id));
        setProjectMonitoringStatus((prev) => ({ ...prev, [projectId]: false }));
      } else {
        if (selectedHeaderObjects.length === 0) {
          if (DEBUG_MODE) console.log(`Project ${projectId}: Cannot start monitoring with no headers selected.`);
          return;
        }
        if (DEBUG_MODE)
          console.log(`Starting monitoring for project ${projectId}, ${selectedHeaderObjects.length} headers`);
        selectedHeaderObjects.forEach((header) => startMonitoring(header));
        setProjectMonitoringStatus((prev) => ({ ...prev, [projectId]: true }));
      }
    },
    [
      projectMonitoringStatus,
      selectedHeaders,
      headersByStage, // headersByStage is less likely to change rapidly than thresholds object
      thresholds, // Still needed, but callback structure is safer
      startMonitoring,
      stopMonitoring,
    ]
  );

  // --- Filtering Logic for Display ---
  const getFilteredHeadersForStage = useCallback(
    (stageId) => {
      const headers = headersByStage[stageId] || [];
      if (filter === "all") {
        return headers;
      }
      return headers.filter((h) => {
        if (filter === "positive") {
          const positiveMatch = positivePatterns.length === 0 || matchPatterns(h.name, positivePatterns);
          const negativeMatch = negativePatterns.length > 0 && matchPatterns(h.name, negativePatterns);
          return positiveMatch && !negativeMatch;
        } else if (filter === "negative") {
          return matchPatterns(h.name, negativePatterns);
        }
        return false;
      });
    },
    [headersByStage, filter, positivePatterns, negativePatterns]
  );

  // --- Render Logic ---
  if (isLoadingSettings) return <div className="p-4 text-center">Loading settings...</div>;
  if (settingsError) return <div className="p-4 text-center text-red-600">Error loading settings: {settingsError}</div>;
  // Display loading/error states related to stage data
  if (isLoadingStages && displayStages.length === 0)
    return <div className="p-4 text-center">Loading project data...</div>; // Show initial load
  if (stagesError && displayStages.length === 0)
    return <div className="p-4 text-center text-red-600">Error loading project data: {stagesError}</div>; // Show initial error

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900 p-4 flex flex-col lg:flex-row gap-4">
      <div className="flex-grow">
        {/* Filter Buttons & Refresh */}
        <div className="mb-4 flex gap-2 items-center">
          <button
            onClick={() => setFilter("positive")}
            className={`px-3 py-1 text-sm rounded ${
              filter === "positive" ? "bg-blue-600 text-white" : "bg-white text-gray-700 border"
            }`}
          >
            Positive Match
          </button>
          <button
            onClick={() => setFilter("negative")}
            className={`px-3 py-1 text-sm rounded ${
              filter === "negative" ? "bg-blue-600 text-white" : "bg-white text-gray-700 border"
            }`}
          >
            Negative Match
          </button>
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1 text-sm rounded ${
              filter === "all" ? "bg-blue-600 text-white" : "bg-white text-gray-700 border"
            }`}
          >
            Show All
          </button>
          <button
            onClick={refreshStageData}
            disabled={isLoadingStages} // Disable while loading stages
            className="px-3 py-1 text-sm rounded bg-gray-200 hover:bg-gray-300 text-gray-700 border disabled:opacity-50 ml-auto"
          >
            {isLoadingStages ? "Refreshing..." : "Refresh Stages"}
          </button>
        </div>

        <div className="bg-blue-700 text-white px-4 py-2 rounded-t-md mb-2 font-semibold">
          Active Stages {displayStages.length > 0 && `(${displayStages.length} visible)`}
        </div>

        {/* Display specific errors if they occur after initial load */}
        {isLoadingStages && displayStages.length > 0 && (
          <div className="text-center py-2 text-sm text-blue-600">Refreshing stages...</div>
        )}
        {stagesError && displayStages.length > 0 && (
          <div className="text-center py-2 text-red-600">Error refreshing stages: {stagesError}</div>
        )}
        {monitoringError && <div className="text-center py-2 text-orange-600">Monitoring Error: {monitoringError}</div>}

        {!isLoadingStages && !stagesError && displayStages.length === 0 && (
          <div className="text-center py-4 text-gray-500">No active, non-test stages found.</div>
        )}

        <div className="space-y-6">
          {displayStages.map((stage) => {
            const projectId = stage.projectId;
            const stageId = stage.stageId;
            const isProjectMonitoringActive = !!projectMonitoringStatus[projectId];
            const currentSelected = selectedHeaders[projectId] || new Set();
            const currentThresholds = thresholds[projectId] || {};
            const stageHeaders = headersByStage[stageId] || [];
            const displayedHeaders = getFilteredHeadersForStage(stageId);

            return (
              <div key={projectId} className="bg-white shadow border rounded-md">
                {/* Stage Header */}
                <div className="bg-gray-100 px-4 py-2 border-b text-sm font-semibold flex justify-between items-center">
                  <div>
                    <span className="text-blue-600">
                      {stage.projectName} - {stage.wellNumber} - {stage.stageName}
                    </span>
                    <span className="text-xs text-gray-500 ml-2">
                      (Company: {stage.companyName} | Stage ID: {stage.stageId})
                    </span>
                  </div>
                  <button
                    onClick={() => handleMonitoringToggle(projectId, stageId)}
                    disabled={!isProjectMonitoringActive && currentSelected.size === 0}
                    className={`px-2 py-1 text-xs rounded ${
                      isProjectMonitoringActive
                        ? "bg-red-500 hover:bg-red-600 text-white"
                        : "bg-green-500 hover:bg-green-600 text-white disabled:bg-gray-400"
                    }`}
                  >
                    {isProjectMonitoringActive ? (
                      <Pause className="inline w-3 h-3 mr-1" />
                    ) : (
                      <Play className="inline w-3 h-3 mr-1" />
                    )}
                    {isProjectMonitoringActive ? "Stop Monitoring" : "Start Monitoring"}
                  </button>
                </div>

                {/* Stage Body - Headers */}
                <div className="p-4">
                  {stageHeaders.length === 0 && !isLoadingStages && (
                    <div className="text-sm text-gray-500">No headers found for this stage.</div>
                  )}
                  {displayedHeaders.length === 0 && stageHeaders.length > 0 && filter !== "all" && (
                    <div className="text-sm text-gray-500">No headers match the current filter.</div>
                  )}

                  {displayedHeaders.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      {displayedHeaders.map((h) => {
                        //we have 2 stages  each stage

                        const headerId = h.id;
                        const isSelected = currentSelected.has(headerId);
                        const isActivelyMonitored = monitoredHeaders.some((mh) => mh.id === headerId);
                        const headerData = headerValues[headerId];
                        const displayValue =
                          headerData?.value !== null && headerData?.value !== undefined
                            ? Number(headerData.value).toFixed(2)
                            : "--";
                        const hasError = !!headerData?.error;
                        const hasAlert = monitoringAlerts.some((a) => a.headerId === headerId);
                        const currentThreshold = currentThresholds[headerId];
                        const numericThreshold =
                          typeof currentThreshold === "number" && !isNaN(currentThreshold) ? currentThreshold : null;

                        const isBelowThreshold =
                          headerData?.value !== null &&
                          headerData?.value !== undefined &&
                          numericThreshold !== null &&
                          headerData.value < numericThreshold;

                        let cardStyle = "border-gray-300 bg-white";
                        if (hasAlert) cardStyle = "border-red-600 bg-red-100";
                        else if (hasError) cardStyle = "border-orange-500 bg-orange-50 text-orange-700";
                        else if (isActivelyMonitored && isBelowThreshold) cardStyle = "border-yellow-500 bg-yellow-50";
                        else if (isSelected) cardStyle = "border-blue-400 bg-blue-50";

                        return (
                          <div
                            key={headerId}
                            className={`border rounded-md p-3 text-sm shadow-sm relative transition-colors duration-150 ${cardStyle}`}
                          >
                            {/* Header Name & Selection */}
                            <div className="flex justify-between items-start mb-1">
                              <div className="flex items-center gap-2 font-medium break-words w-full pr-6">
                                <button
                                  onClick={() => handleHeaderSelect(projectId, headerId)}
                                  title={isSelected ? "Deselect Header" : "Select Header"}
                                  className="flex-shrink-0"
                                  disabled={isProjectMonitoringActive}
                                >
                                  {isSelected ? (
                                    <CheckSquare className="w-4 h-4 text-blue-600" />
                                  ) : (
                                    <Square className="w-4 h-4 text-gray-400" />
                                  )}
                                </button>
                                <span className="overflow-hidden overflow-ellipsis whitespace-nowrap" title={h.name}>
                                  {h.name}
                                </span>
                              </div>
                              {/* Status Icons */}
                              <div className="absolute top-2 right-2 flex gap-1">
                                {isActivelyMonitored && (
                                  <Play className="w-4 h-4 text-green-500" title="Monitoring Active" />
                                )}
                                {hasAlert && <BellIcon className="w-4 h-4 text-red-500" title="Alert Active" />}
                                {hasError && (
                                  <AlertCircle
                                    className="w-4 h-4 text-orange-600"
                                    title={`Fetch Error: ${monitoringError || "Unknown"}`}
                                  />
                                )}
                              </div>
                            </div>
                            {/* Value Display */}
                            <div className="text-2xl font-bold mt-2">
                              {hasError ? <span className="text-orange-600">Error</span> : displayValue}
                              {isActivelyMonitored && !hasError && isBelowThreshold && (
                                <AlertCircle
                                  className={`inline w-4 h-4 ml-2 ${hasAlert ? "text-red-500" : "text-yellow-500"}`}
                                  title={`Value below threshold (${numericThreshold})`}
                                />
                              )}
                            </div>
                            {/* Threshold Input */}
                            {isSelected && (
                              <div className="mt-2 pt-2 border-t border-gray-200">
                                <label
                                  htmlFor={`threshold-${projectId}-${headerId}`}
                                  className="text-xs text-gray-600 block mb-1"
                                >
                                  Alert Threshold:
                                </label>
                                <input
                                  id={`threshold-${projectId}-${headerId}`}
                                  type="number"
                                  step="any"
                                  value={currentThresholds[headerId] ?? ""}
                                  onChange={(e) => handleThresholdChange(projectId, headerId, e.target.value)}
                                  className="w-full p-1 border border-gray-300 rounded text-sm disabled:bg-gray-100"
                                  placeholder="Enter value..."
                                  disabled={isProjectMonitoringActive}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Active Alerts Sidebar */}
      <div className="w-full lg:w-1/4 lg:max-w-sm flex-shrink-0">
        <div className="bg-red-700 text-white px-4 py-2 rounded-t-md mb-2 flex justify-between items-center">
          <span className="font-semibold">Active Alerts ({monitoringAlerts.length})</span>
          {monitoringAlerts.length > 0 && (
            <button
              onClick={clearAllAlerts}
              className="text-xs bg-red-800 hover:bg-red-900 px-2 py-0.5 rounded"
              title="Clear All Alerts"
            >
              <X className="inline w-3 h-3 mr-1" /> Clear All
            </button>
          )}
        </div>
        <div className="bg-white shadow border rounded-b-md p-4 max-h-[calc(100vh-10rem)] overflow-y-auto">
          {monitoringAlerts.length === 0 ? (
            <div className="text-gray-500 text-sm">No active alerts.</div>
          ) : (
            <ul className="space-y-3">
              {monitoringAlerts.map((alert) => {
                // Find stage info for context - *Optimization Note: This might be slow if many alerts/stages*
                const alertStageInfo = displayStages.find((stage) =>
                  (headersByStage[stage.stageId] || []).some((h) => h.id === alert.headerId)
                );

                return (
                  <li key={alert.id} className="border-b pb-3 last:border-b-0 relative pr-6">
                    <button
                      onClick={() => dismissAlert(alert.id)}
                      className="absolute top-0 right-0 text-gray-400 hover:text-red-600 p-1"
                      title="Dismiss Alert"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <div className={`font-semibold ${alert.type === "error" ? "text-orange-600" : "text-red-600"}`}>
                      {alert.type === "frozen" ? "Frozen Data ❄️" : alert.type === "error" ? "Fetch Error" : "Alert"}
                    </div>
                    <div className="text-xs text-gray-700 font-medium">
                      Header: {alert.headerName} <span className="text-gray-500">(ID: {alert.headerId})</span>
                    </div>
                    {alertStageInfo ? (
                      <>
                        <div className="text-xs text-gray-600">Stage: {alertStageInfo.stageName}</div>
                        <div className="text-xs text-gray-600">Well: {alertStageInfo.wellNumber}</div>
                        <div className="text-xs text-gray-600">Project: {alertStageInfo.projectName}</div>
                      </>
                    ) : (
                      <div className="text-xs text-gray-500 italic">Stage info unavailable</div>
                    )}
                    <div className="text-sm mt-1">
                      {alert.type === "frozen" && alert.message}
                      {alert.type === "error" && <span className="text-orange-700">{alert.message}</span>}
                      {alert.type === "threshold" && (
                        <span className="text-red-700">
                          Value {alert.value?.toFixed(2)} below threshold ({alert.threshold})
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">{new Date(alert.timestamp).toLocaleString()}</div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
