import React, { useEffect, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  CardActions,
  Button,
  TextField,
  IconButton,
  Divider,
  CircularProgress,
  Alert,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Paper,
  InputAdornment,
  Tooltip,
  Switch,
  FormControlLabel,
  Skeleton,
  Menu,
  MenuItem,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import DeleteIcon from "@mui/icons-material/Delete";
import SettingsIcon from "@mui/icons-material/Settings";
import RefreshIcon from "@mui/icons-material/Refresh";
import NotificationsOffIcon from "@mui/icons-material/NotificationsOff";
import {
  fetchMonitoredHeaders,
  fetchHeaderValues,
  removeMonitoredHeader,
  removeProjectHeaders,
  updateHeaderSettings,
  clearMonitoredHeadersError, // Import the clear error action
  addMonitoredHeader,
} from "../store/slices/monitoredHeadersSlice";
import { fetchSettings } from "../store/slices/settingsSlice";
import { fetchActiveStages } from "../store/slices/stagesSlice";
import { INTERVAL_TO_REFETCH_ACTIVE_STAGES } from "../constants";
import axios from "axios";

const MonitoredHeaders = () => {
  const dispatch = useDispatch();
  const { monitoredHeaders, headerValues, loading, error, removingHeader, selectedStageHeaders } = useSelector(
    (state) => state.monitoredHeaders
  );
  const { settings, loading: settingsLoading, error: settingsError } = useSelector((state) => state.settings);
  const [expandedProjects, setExpandedProjects] = useState({});
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [currentHeader, setCurrentHeader] = useState(null);
  const [headerSettings, setHeaderSettings] = useState({
    threshold: "",
    alertDuration: "",
    frozenThreshold: "",
  });
  // Add auto-refresh functionality
  useEffect(() => {
    // Function to fetch all data together
    const fetchAllData = async () => {
      try {
        console.log("Fetching all monitoring data...");
        // First clear any errors
        dispatch(clearMonitoredHeadersError());

        // Get the current header IDs to maintain the same set across refreshes
        const currentHeaderIds = monitoredHeaders.map((header) => header.headerId);

        // Then fetch all data together - explicitly passing the current headerIds
        await Promise.all([
          dispatch(fetchSettings()),
          dispatch(fetchMonitoredHeaders(currentHeaderIds)),
          dispatch(fetchHeaderValues()),
        ]);
      } catch (error) {
        console.error("Error fetching monitoring data:", error);
      }
    };

    // Initial fetch
    fetchAllData();

    // Get polling interval from settings (default to 5 seconds)
    const pollingIntervalMs = (settings?.pollingInterval || 5) * 1000;
    console.log(`Setting up polling interval: ${pollingIntervalMs}ms`);

    // Set up auto-refresh interval
    const refreshInterval = setInterval(fetchAllData, pollingIntervalMs);

    // Clean up interval on component unmount
    return () => clearInterval(refreshInterval);
  }, [settings?.pollingInterval, dispatch, monitoredHeaders]);

  //refresh the stages  in 10 seconds
  useEffect(() => {
    dispatch(fetchActiveStages()); //INITIAL FETCH

    const stagesInterval = setInterval(() => {
      dispatch(fetchActiveStages());
    }, INTERVAL_TO_REFETCH_ACTIVE_STAGES);

    return () => clearInterval(stagesInterval);
  }, [dispatch]);

  // Manual refresh function
  const refreshData = async () => {
    try {
      console.log("Manually refreshing all data...");
      dispatch(clearMonitoredHeadersError());

      // Get current header IDs to maintain consistency
      const currentHeaderIds = monitoredHeaders.map((header) => header.headerId);

      // Fetch all data in parallel, passing the explicit IDs
      await Promise.all([
        dispatch(fetchSettings()),
        dispatch(fetchMonitoredHeaders(currentHeaderIds)),
        dispatch(fetchHeaderValues()),
      ]);
    } catch (error) {
      console.error("Error refreshing data:", error);
    }
  };

  // Ensure monitoredHeaders is always an array for safe operations
  const safeMonitoredHeaders = Array.isArray(monitoredHeaders) ? monitoredHeaders : [];

  // Group headers by project
  const groupedHeaders = safeMonitoredHeaders.reduce((acc, header) => {
    const projectId = header.projectId;
    if (!acc[projectId]) {
      acc[projectId] = {
        projectId,
        projectName: header.projectName,
        companyName: header.companyName,
        headers: [],
      };
    }
    acc[projectId].headers.push(header);
    return acc;
  }, {});

  // Set all projects to expanded by default when the component mounts or when groupedHeaders changes
  useEffect(() => {
    const projectIds = Object.keys(groupedHeaders);
    const newExpandedState = {};
    projectIds.forEach((projectId) => {
      newExpandedState[projectId] = true;
    });
    setExpandedProjects(newExpandedState);
  }, []);

  // Helper function to sort headers by state (LOADING first)
  const sortHeadersByState = (headers) => {
    if (!Array.isArray(headerValues) || headerValues.length === 0) {
      return headers; // Can't sort by state if we don't have state data
    }

    return [...headers].sort((a, b) => {
      const aState = getHeaderState(a.headerId);
      const bState = getHeaderState(b.headerId);

      // LOADING state headers first
      if (aState === "LOADING" && bState !== "LOADING") return -1;
      if (aState !== "LOADING" && bState === "LOADING") return 1;

      // Then sort by name
      return a.headerName.localeCompare(b.headerName);
    });
  };

  const handleProjectExpand = (projectId) => {
    setExpandedProjects((prev) => ({
      ...prev,
      [projectId]: !prev[projectId],
    }));
  };

  const handleRemoveHeader = (headerId) => {
    dispatch(removeMonitoredHeader(headerId));
  };

  const handleRemoveProject = (projectId) => {
    dispatch(removeProjectHeaders(projectId));
  };

  const handleOpenSettings = (header) => {
    if (!settings || settingsLoading || settingsError) {
      console.error("Settings not loaded yet or failed to load.");
      // Optionally show a message to the user
      return;
    }
    setCurrentHeader(header);

    // Determine default values from global settings based on header type
    let defaultThreshold = 20; // Set default to 20
    let defaultAlertDuration = "";
    let defaultFrozenThreshold = "";

    const headerName = header?.headerName?.toLowerCase() || "";
    let headerType = null;

    // Safely access pattern categories
    const pressureConfig = settings?.patternCategories?.pressure;
    const batteryConfig = settings?.patternCategories?.battery;

    // Check pressure patterns
    if (pressureConfig?.patterns?.some((pattern) => headerName.includes(pattern.toLowerCase()))) {
      if (!pressureConfig?.negativePatterns?.some((pattern) => headerName.includes(pattern.toLowerCase()))) {
        headerType = "pressure";
        defaultThreshold = pressureConfig.threshold || 20; // Default to 20 if not set
        defaultAlertDuration = pressureConfig.alertDuration;
        defaultFrozenThreshold = pressureConfig.frozenThreshold;
      }
    }

    // Check battery patterns (only if not already pressure)
    if (!headerType && batteryConfig?.patterns?.some((pattern) => headerName.includes(pattern.toLowerCase()))) {
      if (!batteryConfig?.negativePatterns?.some((pattern) => headerName.includes(pattern.toLowerCase()))) {
        headerType = "battery";
        defaultThreshold = batteryConfig.threshold || 20; // Default to 20 if not set
        defaultAlertDuration = batteryConfig.alertDuration;
        defaultFrozenThreshold = batteryConfig.frozenThreshold;
      }
    }

    // Use header-specific settings if available, otherwise use determined defaults
    const useCustom = header?.settings && header.settings.threshold !== null && header.settings.threshold !== undefined;

    setHeaderSettings({
      threshold: useCustom ? header.settings.threshold : defaultThreshold || "",
      alertDuration: useCustom ? header.settings.alertDuration : defaultAlertDuration || "",
      frozenThreshold: useCustom ? header.settings.frozenThreshold : defaultFrozenThreshold || "",
      useCustomSettings: useCustom,
    });

    setSettingsDialogOpen(true);
  };

  const handleSaveSettings = () => {
    if (!currentHeader) return;

    // If useCustomSettings is false, save null to revert to global defaults
    const settingsToSave = headerSettings.useCustomSettings
      ? {
          threshold: headerSettings.threshold !== "" ? Number(headerSettings.threshold) : null,
          alertDuration: headerSettings.alertDuration !== "" ? Number(headerSettings.alertDuration) : null,
          frozenThreshold: headerSettings.frozenThreshold !== "" ? Number(headerSettings.frozenThreshold) : null,
        }
      : null; // Send null to indicate using global settings

    dispatch(
      updateHeaderSettings({
        headerId: currentHeader.headerId,
        settings: settingsToSave,
        threshold: headerSettings.threshold,
      })
    );

    setSettingsDialogOpen(false);
  };

  const handleSettingChange = (setting, value) => {
    setHeaderSettings((prev) => ({
      ...prev,
      [setting]: value,
    }));
  };

  // Function to handle switch change for custom settings
  const handleUseCustomChange = (event) => {
    const checked = event.target.checked;
    setHeaderSettings((prev) => ({
      ...prev,
      useCustomSettings: checked,
      // Optionally reset fields if switching back to global
      // threshold: checked ? prev.threshold : '',
      // alertDuration: checked ? prev.alertDuration : '',
      // frozenThreshold: checked ? prev.frozenThreshold : '',
    }));
  };

  // Get the current value for a header, safely
  const getCurrentValue = (headerId) => {
    // Make sure headerValues exists and is an array before trying to find
    if (!Array.isArray(headerValues)) {
      return null;
    }

    // First check if we have this header in our values
    const headerValue = headerValues.find((header) => header.id === headerId);

    // If we have a value already parsed and available, use it
    if (headerValue?.value !== undefined && headerValue?.value !== null) {
      return headerValue.value;
    }

    // If we couldn't find anything, return null
    return null;
  };

  // Check if a header has an active alert, safely
  const hasAlert = (headerId) => {
    if (!Array.isArray(headerValues)) {
      return false;
    }
    const headerValue = headerValues.find((h) => h.id === headerId);
    return headerValue?.alert && !headerValue.alert.snoozed;
  };

  // Check if a header has a snoozed alert
  const hasSnoozedAlert = (headerId) => {
    if (!Array.isArray(headerValues)) {
      return false;
    }
    const headerValue = headerValues.find((h) => h.id === headerId);
    return headerValue?.alert && headerValue.alert.snoozed;
  };

  // Get snooze until time
  const getSnoozeUntil = (headerId) => {
    if (!Array.isArray(headerValues)) {
      return null;
    }
    const headerValue = headerValues.find((h) => h.id === headerId);
    return headerValue?.alert?.snoozeUntil;
  };

  // Check if a header has frozen data
  const isFrozen = (headerId) => {
    if (!Array.isArray(headerValues)) {
      return false;
    }
    const headerValue = headerValues.find((header) => header.id === headerId);
    return headerValue?.frozenDuration > 0;
  };

  // Helper to get display threshold (custom or global)
  const getDisplayThreshold = (header) => {
    if (header?.settings?.threshold !== null && header?.settings?.threshold !== undefined) {
      return header.settings.threshold;
    }
    // Logic to determine global default (simplified example)
    // This needs the full settings object available here or passed in
    if (!settings) return 20; // Default to 20 if settings not loaded
    const headerName = header?.headerName?.toLowerCase() || "";
    const pressureConfig = settings?.patternCategories?.pressure;
    const batteryConfig = settings?.patternCategories?.battery;
    if (
      pressureConfig?.patterns?.some((p) => headerName.includes(p.toLowerCase())) &&
      !pressureConfig?.negativePatterns?.some((p) => headerName.includes(p.toLowerCase()))
    )
      return pressureConfig.threshold || 20; // Default to 20 if not set
    if (
      batteryConfig?.patterns?.some((p) => headerName.includes(p.toLowerCase())) &&
      !batteryConfig?.negativePatterns?.some((p) => headerName.includes(p.toLowerCase()))
    )
      return batteryConfig.threshold || 20; // Default to 20 if not set
    return 20; // Default to 20 when no matching global category
  };

  // Similar helpers for alertDuration and frozenThreshold...
  const getDisplayAlertDuration = (header) => {
    if (header?.settings?.alertDuration !== null && header?.settings?.alertDuration !== undefined) {
      return header.settings.alertDuration;
    }
    if (!settings) return 20; // Default to 20 if settings not loaded
    const headerName = header?.headerName?.toLowerCase() || "";
    const pressureConfig = settings?.patternCategories?.pressure;
    const batteryConfig = settings?.patternCategories?.battery;
    if (
      pressureConfig?.patterns?.some((p) => headerName.includes(p.toLowerCase())) &&
      !pressureConfig?.negativePatterns?.some((p) => headerName.includes(p.toLowerCase()))
    )
      return pressureConfig.alertDuration || 20; // Default to 20 if not set
    if (
      batteryConfig?.patterns?.some((p) => headerName.includes(p.toLowerCase())) &&
      !batteryConfig?.negativePatterns?.some((p) => headerName.includes(p.toLowerCase()))
    )
      return batteryConfig.alertDuration || 20; // Default to 20 if not set
    return 20; // Default to 20 when no matching global category
  };

  const getDisplayFrozenThreshold = (header) => {
    if (header?.settings?.frozenThreshold !== null && header?.settings?.frozenThreshold !== undefined) {
      return header.settings.frozenThreshold;
    }
    if (!settings) return 20; // Default to 20 if settings not loaded
    const headerName = header?.headerName?.toLowerCase() || "";
    const pressureConfig = settings?.patternCategories?.pressure;
    const batteryConfig = settings?.patternCategories?.battery;
    if (
      pressureConfig?.patterns?.some((p) => headerName.includes(p.toLowerCase())) &&
      !pressureConfig?.negativePatterns?.some((p) => headerName.includes(p.toLowerCase()))
    )
      return pressureConfig.frozenThreshold || 20; // Default to 20 if not set
    if (
      batteryConfig?.patterns?.some((p) => headerName.includes(p.toLowerCase())) &&
      !batteryConfig?.negativePatterns?.some((p) => headerName.includes(p.toLowerCase()))
    )
      return batteryConfig.frozenThreshold || 20; // Default to 20 if not set
    return 20; // Default to 20 when no matching global category
  };

  // Get the timestamp for a header
  const getTimestamp = (headerId) => {
    if (!Array.isArray(headerValues)) {
      return null;
    }

    const headerValue = headerValues.find((header) => header.id === headerId);
    return headerValue?.lastUpdated || null;
  };

  // Get the state of a header
  const getHeaderState = (headerId) => {
    if (!Array.isArray(headerValues)) {
      return null;
    }

    const headerValue = headerValues.find((header) => header.id === headerId);

    return headerValue?.state || null;
  };

  // Check if a header is in LOADING state
  const isLoading = (headerId) => {
    return getHeaderState(headerId) === "LOADING";
  };

  // Format timestamp for display
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return "N/A";

    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) return "Invalid date";

      // Format date and time
      const formattedDate = date.toLocaleDateString([], {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });

      const formattedTime = date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      });

      return `${formattedDate} ${formattedTime}`;
    } catch (error) {
      console.error("Error formatting timestamp:", error);
      return "Error";
    }
  };

  // Add state for snooze functionality
  const [snoozeAnchorEl, setSnoozeAnchorEl] = useState(null);
  const [headerToSnooze, setHeaderToSnooze] = useState(null);
  const [isSnoozing, setIsSnoozing] = useState(false);

  // Function to handle opening snooze menu
  const handleSnoozeClick = (event, headerId) => {
    setSnoozeAnchorEl(event.currentTarget);
    setHeaderToSnooze(headerId);
  };

  // Function to handle closing snooze menu
  const handleSnoozeClose = () => {
    setSnoozeAnchorEl(null);
    setHeaderToSnooze(null);
  };

  // Function to handle snooze duration selection
  const handleSnooze = async (duration) => {
    if (!headerToSnooze) return;

    setIsSnoozing(true);
    try {
      // Find the alert for this header
      const headerValue = headerValues.find((h) => h.id === headerToSnooze);
      if (headerValue?.alert?.id) {
        // Call the API to snooze the alert
        await axios.post(`/api/monitoring/alerts/${headerValue.alert.id}/snooze`, {
          duration: duration,
        });

        // Refresh the data to show updated snooze status
        await dispatch(fetchHeaderValues());
      }
    } catch (error) {
      console.error("Failed to snooze alert:", error);
    } finally {
      setIsSnoozing(false);
      handleSnoozeClose();
    }
  };

  // Get alert ID from header
  const getAlertId = (headerId) => {
    const headerValue = headerValues.find((h) => h.id === headerId);
    return headerValue?.alert?.id;
  };

  useEffect(() => {
    const refreshEndedHeaders = async () => {
      try {
        // 1. Filter headers with "ENDED" state
        const endedHeaders = headerValues?.filter((header) => header.state === "ENDED") || [];

        if (endedHeaders.length === 0) return;

        console.log(`Found ${endedHeaders.length} ENDED headers that need refreshing`);

        // 2. Fetch all active stages
        const stagesResponse = await axios.get("/api/monitoring/active-stages");
        const activeStages = stagesResponse.data.stages || [];

        if (activeStages.length === 0) {
          console.log("No active stages available to find replacement headers");
          return;
        }

        // Process each ended header
        for (const endedHeader of endedHeaders) {
          console.log(`Processing ended header: ${endedHeader.name} (ID: ${endedHeader.id})`);

          // Find this header in our monitored headers to get settings
          const monitoredHeader = monitoredHeaders.find((h) => h.headerId === endedHeader.id);
          if (!monitoredHeader) {
            console.log(`Cannot find header ${endedHeader.id} in monitored headers list`);
            continue;
          }

          // Keep track if we found a replacement
          let replacementFound = false;

          // Search through active stages for a replacement
          for (const stage of activeStages) {
            if (replacementFound) break;

            try {
              // Fetch headers for this stage
              const headersResponse = await axios.get(`/api/monitoring/headers/${stage.stageId}`);
              const stageHeaders = headersResponse.data.headers || [];

              // Look for a header with the same name
              const matchingHeader = stageHeaders.find(
                (h) => h.name.toLowerCase() === monitoredHeader.headerName.toLowerCase()
              );

              if (matchingHeader) {
                console.log(`Found replacement header ${matchingHeader.id} in stage ${stage.stageId}`);

                // Prepare replacement data with same settings
                const replacement = {
                  stageId: stage.stageId,
                  projectId: monitoredHeader.projectId,
                  headerId: matchingHeader.id,
                  headerName: matchingHeader.name,
                  projectName: monitoredHeader.projectName,
                  companyName: monitoredHeader.companyName,
                  settings: monitoredHeader.settings,
                };

                // Remove old header
                await dispatch(removeMonitoredHeader(endedHeader.id));

                // Add new header
                await dispatch(addMonitoredHeader(replacement));

                replacementFound = true;
                break;
              }
            } catch (error) {
              console.error(`Error fetching headers for stage ${stage.stageId}:`, error);
            }
          }

          if (!replacementFound) {
            console.log(`No replacement found for header ${monitoredHeader.headerName}`);
          }
        }

        // Refresh header values after replacing
        await dispatch(fetchHeaderValues());
      } catch (error) {
        console.error("Error refreshing ended headers:", error);
      }
    };

    // Only run if we have headerValues
    if (Array.isArray(headerValues) && headerValues.length > 0) {
      refreshEndedHeaders();
    }
  }, [headerValues, dispatch, monitoredHeaders]);

  return (
    <Box>
      <Box sx={{ mb: 3, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Typography variant="h4" component="h1">
          Monitored Headers
        </Typography>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={refreshData}
          disabled={loading} // Disable refresh while loading
        >
          {loading ? <CircularProgress size={20} sx={{ mr: 1 }} /> : "Refresh Values"}
        </Button>
      </Box>

      {loading && safeMonitoredHeaders.length === 0 && (
        <CircularProgress sx={{ display: "block", mx: "auto", my: 4 }} />
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Error loading monitored headers: {typeof error === "string" ? error : JSON.stringify(error)}
        </Alert>
      )}

      {!loading && !error && safeMonitoredHeaders.length === 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          No headers are being monitored. Go to the Dashboard to select headers to monitor.
        </Alert>
      )}

      {Object.values(groupedHeaders).map((project) => (
        <Paper key={`project-${project.projectId}`} sx={{ mb: 3, overflow: "hidden" }}>
          <Accordion
            expanded={expandedProjects[project.projectId] === true}
            onChange={() => handleProjectExpand(project.projectId)}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              sx={{ backgroundColor: "grey.200" }} // Slightly different background
            >
              <Box
                sx={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center", pr: 2 }}
              >
                <Typography variant="h6">
                  {project.companyName} - {project.projectName}
                </Typography>
                <Chip label={`${project.headers.length} headers`} size="small" color="primary" />
              </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 2, pb: 1 }}>
              {" "}
              {/* Adjust padding */}
              <Box sx={{ mb: 2, display: "flex", justifyContent: "flex-end" }}>
                <Button
                  color="error"
                  variant="outlined" // Make less prominent
                  size="small" // Smaller button
                  startIcon={<DeleteIcon />}
                  onClick={() => handleRemoveProject(project.projectId)}
                >
                  Remove All From Project
                </Button>
              </Box>
              <Grid container spacing={2}>
                {" "}
                {/* Reduced spacing */}
                {sortHeadersByState(project.headers).map((header) => {
                  const isAlerting = hasAlert(header.headerId);
                  const isSnoozed = hasSnoozedAlert(header.headerId);
                  const isDataFrozen = isFrozen(header.headerId);
                  const currentValue = getCurrentValue(header.headerId);
                  const displayThreshold = getDisplayThreshold(header);
                  const displayAlertDuration = getDisplayAlertDuration(header);
                  const displayFrozenThreshold = getDisplayFrozenThreshold(header);
                  const snoozeUntil = getSnoozeUntil(header.headerId);

                  return (
                    <Grid item xs={12} sm={6} md={4} lg={3} key={header.headerId || header.id}>
                      <Card
                        variant="outlined"
                        sx={{
                          height: "100%", // Ensure cards have same height
                          borderColor: isAlerting
                            ? "error.main"
                            : isDataFrozen
                            ? "warning.main"
                            : isSnoozed
                            ? "info.main"
                            : "divider",
                          borderWidth: isAlerting || isDataFrozen || isSnoozed ? 2 : 1,
                          backgroundColor:
                            isAlerting || isDataFrozen || isSnoozed
                              ? isAlerting
                                ? "error.light"
                                : isDataFrozen
                                ? "warning.light"
                                : "info.light"
                              : "background.paper", // Background hint
                        }}
                      >
                        <CardContent sx={{ pb: 1 }}>
                          {" "}
                          {/* Less bottom padding */}
                          <Box
                            sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 0.5 }}
                          >
                            <Tooltip title={header.headerName} placement="top">
                              <Typography variant="subtitle1" fontWeight="bold" sx={{ maxWidth: "80%" }} noWrap>
                                {header.headerName}
                              </Typography>
                            </Tooltip>
                            {(isAlerting || isDataFrozen || isSnoozed) && (
                              <Chip
                                label={isAlerting ? "Alert" : isDataFrozen ? "Frozen" : "Snoozed"}
                                color={isAlerting ? "error" : isDataFrozen ? "warning" : "info"}
                                size="small"
                                sx={{ ml: 1 }} // Add margin
                              />
                            )}
                          </Box>
                          {/* Snooze Until Display */}
                          {isSnoozed && snoozeUntil && (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ display: "block", fontStyle: "italic", mb: 1 }}
                            >
                              Snoozed until: {new Date(snoozeUntil).toLocaleString()}
                            </Typography>
                          )}
                          {/* Header ID and State display */}
                          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{
                                mb: 0.5,
                                fontSize: "0.7rem",
                                fontFamily: "monospace",
                                userSelect: "all", // Makes text selectable for easy copying
                                cursor: "text",
                                backgroundColor: "rgba(0,0,0,0.03)",
                                padding: "2px 4px",
                                borderRadius: "2px",
                                display: "inline-block",
                              }}
                            >
                              ID: {header.headerId}
                            </Typography>

                            <Chip
                              label={isLoading(header.headerId) ? "LOADING" : "ENDED"}
                              color={isLoading(header.headerId) ? "success" : "default"}
                              size="small"
                              sx={{
                                height: "20px",
                                "& .MuiChip-label": {
                                  px: 1,
                                  fontSize: "0.625rem",
                                  fontWeight: isLoading(header.headerId) ? "bold" : "normal",
                                },
                              }}
                            />
                          </Box>
                          <Divider sx={{ mb: 1.5 }} /> {/* Adjust margin */}
                          <Box
                            sx={{
                              display: "flex",
                              justifyContent: "center",
                              alignItems: "center",
                              mb: 1.5,
                              minHeight: "60px",
                              opacity: isLoading(header.headerId) ? 1 : 0.6, // Dim non-loading headers
                            }}
                          >
                            {loading && !headerValues.length ? (
                              <Skeleton variant="text" width={100} height={50} />
                            ) : (
                              <Typography
                                variant="h4"
                                component="div"
                                sx={{
                                  fontWeight: "bold",
                                  color: isLoading(header.headerId) ? "text.primary" : "text.secondary",
                                }}
                              >
                                {currentValue !== null && currentValue !== undefined
                                  ? typeof currentValue === "number"
                                    ? currentValue.toFixed(2)
                                    : String(currentValue)
                                  : "-"}
                              </Typography>
                            )}
                          </Box>
                          {/* Timestamp display */}
                          <Box sx={{ display: "flex", justifyContent: "center", mb: 2 }}>
                            <Typography
                              variant="caption"
                              color={isLoading(header.headerId) ? "text.secondary" : "text.disabled"}
                              align="center"
                              sx={{ whiteSpace: "normal", lineHeight: 1.2 }}
                            >
                              Updated:
                              <br />
                              {formatTimestamp(getTimestamp(header.headerId))}
                              {!isLoading(header.headerId) && (
                                <Box component="span" sx={{ display: "block", fontStyle: "italic", mt: 0.5 }}>
                                  Stage has ended - values no longer updating
                                </Box>
                              )}
                            </Typography>
                          </Box>
                          {/* Display Settings */}
                          <Box sx={{ mb: 0.5 }}>
                            <Typography variant="caption" color="text.secondary">
                              Threshold: {displayThreshold}
                            </Typography>
                          </Box>
                          <Box sx={{ mb: 0.5 }}>
                            <Typography variant="caption" color="text.secondary">
                              Alert Duration: {displayAlertDuration}s
                            </Typography>
                          </Box>
                          <Box>
                            <Typography variant="caption" color="text.secondary">
                              Frozen After: {displayFrozenThreshold}s
                            </Typography>
                          </Box>
                        </CardContent>

                        <Divider />

                        <CardActions sx={{ justifyContent: "space-between" }}>
                          {" "}
                          {/* Space between */}
                          <Button startIcon={<SettingsIcon />} size="small" onClick={() => handleOpenSettings(header)}>
                            Settings
                          </Button>
                          <Button
                            startIcon={<DeleteIcon />}
                            color="error"
                            size="small"
                            onClick={() => handleRemoveHeader(header.headerId)}
                            disabled={removingHeader}
                          >
                            Remove
                          </Button>
                        </CardActions>
                      </Card>
                    </Grid>
                  );
                })}
              </Grid>
            </AccordionDetails>
          </Accordion>
        </Paper>
      ))}

      {/* Header Settings Dialog */}
      <Dialog open={settingsDialogOpen} onClose={() => setSettingsDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Header Settings
          {currentHeader && (
            <Typography variant="subtitle1" color="text.secondary" component="div">
              {currentHeader.headerName}
            </Typography>
          )}
        </DialogTitle>

        <DialogContent dividers>
          <Box sx={{ mb: 2 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={!!headerSettings.useCustomSettings} // Ensure boolean
                  onChange={handleUseCustomChange}
                />
              }
              label="Use custom settings for this header"
            />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              If disabled, global settings for the header type (e.g., pressure, battery) will be used.
            </Typography>
          </Box>

          <TextField
            label="Threshold"
            type="number"
            fullWidth
            value={headerSettings.threshold}
            onChange={(e) => handleSettingChange("threshold", e.target.value)}
            margin="normal"
            disabled={!headerSettings.useCustomSettings}
            helperText="Value threshold that will trigger an alert when crossed"
          />

          <TextField
            label="Alert Duration (seconds)"
            type="number"
            fullWidth
            value={headerSettings.alertDuration}
            onChange={(e) => handleSettingChange("alertDuration", e.target.value)}
            margin="normal"
            disabled={!headerSettings.useCustomSettings}
            helperText="Duration the value must stay below threshold before alerting"
          />

          <TextField
            label="Frozen Threshold (seconds)"
            type="number"
            fullWidth
            value={headerSettings.frozenThreshold}
            onChange={(e) => handleSettingChange("frozenThreshold", e.target.value)}
            margin="normal"
            disabled={!headerSettings.useCustomSettings}
            helperText="How long a value can remain unchanged before alerting as frozen"
          />
        </DialogContent>

        <DialogActions>
          <Button onClick={() => setSettingsDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSaveSettings}
            // Only disable save if using custom and fields are invalid (optional)
            // disabled={headerSettings.useCustomSettings && (headerSettings.threshold === '' || ...)}
          >
            Save Settings
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default MonitoredHeaders;
