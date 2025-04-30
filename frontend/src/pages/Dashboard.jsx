import React, { useEffect, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  CardActions,
  Button,
  Divider,
  CircularProgress,
  Alert,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Checkbox,
  LinearProgress,
  Tooltip,
  IconButton,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import InfoIcon from "@mui/icons-material/Info";
import MonitorHeartIcon from "@mui/icons-material/MonitorHeart";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import { fetchActiveStages } from "../store/slices/stagesSlice";
import { fetchStageHeaders, selectHeader, deselectHeader, clearSelectedHeaders } from "../store/slices/headersSlice";
import { addMonitoredHeader } from "../store/slices/monitoredHeadersSlice";
import { INTERVAL_TO_REFETCH_ACTIVE_STAGES } from "../constants";
const Dashboard = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { activeStages, loading: loadingStages, error: stagesError } = useSelector((state) => state.stages);
  const { byStageId, selectedHeaders } = useSelector((state) => state.headers);
  const { monitoredHeaders, addingHeader, addError } = useSelector((state) => state.monitoredHeaders);
  const [expandedStage, setExpandedStage] = useState(null);
  console.log(monitoredHeaders);
  // Ensure arrays and objects are valid
  const safeActiveStages = Array.isArray(activeStages) ? activeStages : [];
  const safeMonitoredHeaders = Array.isArray(monitoredHeaders) ? monitoredHeaders : [];
  const safeByStageId = byStageId || {};
  const safeSelectedHeaders = selectedHeaders || {};

  //REFETCH ACTIVE STAGES LOGIC
  useEffect(() => {
    dispatch(fetchActiveStages()); //INITIAL FETCH

    const stagesInterval = setInterval(() => {
      dispatch(fetchActiveStages());
    }, INTERVAL_TO_REFETCH_ACTIVE_STAGES);

    return () => clearInterval(stagesInterval);
  }, [dispatch]);


  const handleStageExpand = (stageId) => {
    // Toggle expansion
    const newExpandedStage = expandedStage === stageId ? null : stageId;
    setExpandedStage(newExpandedStage);

    // Fetch headers when expanding
    if (newExpandedStage && (!safeByStageId[stageId] || !safeByStageId[stageId].headers)) {
      dispatch(fetchStageHeaders(stageId));
    }
  };

  const handleHeaderSelect = (stageId, headerId, checked) => {
    if (checked) {
      dispatch(selectHeader({ stageId, headerId }));
    } else {
      dispatch(deselectHeader({ stageId, headerId }));
    }
  };

  const handleStartMonitoring = async (stageId) => {
    const stage = safeActiveStages.find((stage) => stage.stageId === stageId);
    const stageHeaders = safeByStageId[stageId]?.headers || [];
    const selectedStageHeaders = safeSelectedHeaders[stageId] || [];

    if (!stage || selectedStageHeaders.length === 0) return;
    console.log("Selected headers to monitor:", selectedStageHeaders);
    let allAddedSuccessfully = true;
    // Add each selected header to monitored headers
    for (const headerId of selectedStageHeaders) {
      const header = stageHeaders.find((h) => h.id === headerId);
      if (header) {
        try {
          // Await the dispatch to see if it succeeded or failed
          await dispatch(
            addMonitoredHeader({
              stageId,
              projectId: stage.projectId,
              headerId,
              headerName: header.name,
              projectName: stage.projectName || stage.stageName,
              companyName: stage.companyName,
              settings: {}, // Default settings
            })
          ).unwrap(); // Use unwrap to catch rejected promises
        } catch (err) {
          console.error("Failed to add header:", headerId, err);
          allAddedSuccessfully = false;
          // Optionally display an error message to the user for the specific header
          break; // Stop trying to add more headers if one fails (optional)
        }
      }
    }

    // Clear selected headers regardless of success/failure
    dispatch(clearSelectedHeaders({ stageId }));

    // Navigate only if all headers were added successfully
    if (allAddedSuccessfully) {
      navigate("/monitored-headers");
    } else {
      // Maybe show a general error message here
      console.error("One or more headers failed to add to monitoring.");
    }
  };

  const isHeaderMonitored = (headerId) => {
    return safeMonitoredHeaders.some((header) => header.headerId === headerId);
  };

  const getMonitoredHeadersCount = (stageId) => {
    const stage = safeActiveStages.find((stage) => stage.stageId === stageId);
    if (!stage) return 0;

    return safeMonitoredHeaders.filter((header) => header.projectId === stage.projectId).length;
  };

  // Helper to display error message
  const renderErrorMessage = (err) => {
    if (!err) return null;
    if (typeof err === "string") return err;
    // Handle the specific structure the backend sends on 500
    if (err.error) return `${err.error}${err.details ? `: ${err.details}` : ""}`;
    // Handle potential stringified JSON in payload
    try {
      const parsed = JSON.parse(err);
      if (parsed.error) return `${parsed.error}${parsed.details ? `: ${parsed.details}` : ""}`;
    } catch (e) {
      /* Ignore parsing error */
    }
    // Fallback
    return JSON.stringify(err);
  };

  // Group stages by projectId
  const groupStagesByProject = (stages) => {
    const grouped = {};

    stages.forEach((stage) => {
      if (!stage.projectId) return; // Skip if no projectId

      if (!grouped[stage.projectId]) {
        // Create new group with the first stage as template
        grouped[stage.projectId] = {
          ...stage,
          wellIds: [stage.wellId],
          stageIds: [stage.stageId],
          allStages: [stage],
        };
      } else {
        // Add to existing group
        grouped[stage.projectId].wellIds = [...new Set([...grouped[stage.projectId].wellIds, stage.wellId])];
        grouped[stage.projectId].stageIds = [...new Set([...grouped[stage.projectId].stageIds, stage.stageId])];
        grouped[stage.projectId].allStages.push(stage);
      }
    });

    return Object.values(grouped);
  };

  // Group stages by projectId
  const groupedStages = groupStagesByProject(safeActiveStages);

  return (
    <Box>
      <Box sx={{ mb: 3, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Typography variant="h4" component="h1">
          Active Stages
        </Typography>
        <Button variant="contained" onClick={() => navigate("/monitored-headers")} startIcon={<MonitorHeartIcon />}>
          Monitored Headers ({safeMonitoredHeaders.length})
        </Button>
      </Box>

      {loadingStages && <LinearProgress sx={{ mb: 2 }} />}

      {stagesError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {renderErrorMessage(stagesError)}
        </Alert>
      )}

      {addError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Failed to add header: {renderErrorMessage(addError)}
        </Alert>
      )}

      {!loadingStages && !stagesError && safeActiveStages.length === 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          No active stages found. Please check your API connection.
        </Alert>
      )}

      <Grid container spacing={3}>
        {groupedStages.map((project) => {
          const stageId = project.stageIds[0]; // Use the first stageId for expansion
          const {
            headers,
            loading: loadingHeaders,
            error: headersError,
          } = safeByStageId[stageId] || { headers: [], loading: false, error: null };
          const selectedCount = (safeSelectedHeaders[stageId] || []).length;
          const monitoredCount = getMonitoredHeadersCount(stageId);

          return (
            <Grid item xs={12} key={project.projectId}>
              <Card variant="outlined">
                <CardContent sx={{ pb: 1 }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
                    <Typography variant="h6" component="div" sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      {project.companyName || "Unknown Co."} -{" "}
                      {project.projectName || project.stageName || `Project ${project.projectId}`}
                      <Tooltip
                        title={`Project ID: ${project.projectId}, Stages: ${project.stageIds.length}, Wells: ${project.wellIds.length}`}
                      >
                        <IconButton size="small">
                          <InfoIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Typography>

                    <Box>
                      {monitoredCount > 0 && (
                        <Chip
                          color="primary"
                          size="small"
                          label={`${monitoredCount} headers monitored`}
                          sx={{ mr: 1 }}
                        />
                      )}
                      {selectedCount > 0 && (
                        <Chip color="secondary" size="small" label={`${selectedCount} headers selected`} />
                      )}
                    </Box>
                  </Box>

                  <Typography variant="body2" color="text.secondary">
                    {project.wellIds.length} Well{project.wellIds.length !== 1 ? "s" : ""} • {project.stageIds.length}{" "}
                    Stage{project.stageIds.length !== 1 ? "s" : ""}
                  </Typography>
                </CardContent>

                <Divider />

                <Accordion
                  expanded={expandedStage === stageId}
                  onChange={() => handleStageExpand(stageId)}
                  disableGutters
                  elevation={0}
                >
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography>Select Headers to Monitor</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    {loadingHeaders && <CircularProgress size={24} sx={{ display: "block", mx: "auto", my: 2 }} />}

                    {headersError && (
                      <Alert severity="error" sx={{ mb: 2 }}>
                        Error loading headers: {renderErrorMessage(headersError)}
                      </Alert>
                    )}

                    {!loadingHeaders && !headersError && (!headers || headers.length === 0) && (
                      <Typography variant="body2" color="text.secondary" align="center">
                        No headers found for this stage (or none matched filter patterns).
                      </Typography>
                    )}

                    <Grid container spacing={2}>
                      {Array.isArray(headers) &&
                        headers.map((header) => {
                          // Ensure header and id exist
                          if (!header || !header.id) return null;

                          const isMonitored = isHeaderMonitored(header.id);
                          const isSelected = (safeSelectedHeaders[stageId] || []).includes(header.id);

                          return (
                            <Grid item xs={12} sm={6} md={4} lg={3} key={header.id}>
                              <Card variant="outlined" className={`header-card ${isSelected ? "selected-header" : ""}`}>
                                <CardContent sx={{ py: 1 }}>
                                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                    <Tooltip title={header.name || "Unnamed Header"}>
                                      <Typography variant="subtitle2" noWrap sx={{ maxWidth: "80%" }}>
                                        {header.name || "Unnamed Header"}
                                      </Typography>
                                    </Tooltip>
                                    <Checkbox
                                      checked={isSelected}
                                      onChange={(e) => handleHeaderSelect(stageId, header.id, e.target.checked)}
                                      disabled={isMonitored}
                                    />
                                  </Box>
                                  <Typography variant="caption" color="text.secondary" component="div">
                                    ID: {header.id}
                                  </Typography>
                                  {isMonitored && (
                                    <Chip label="Already Monitored" size="small" color="primary" sx={{ mt: 1 }} />
                                  )}
                                </CardContent>
                              </Card>
                            </Grid>
                          );
                        })}
                    </Grid>
                  </AccordionDetails>
                </Accordion>

                <CardActions>
                  <Button
                    startIcon={<PlayArrowIcon />}
                    color="primary"
                    disabled={
                      !safeSelectedHeaders[stageId] || safeSelectedHeaders[stageId].length === 0 || addingHeader
                    }
                    onClick={() => handleStartMonitoring(stageId)}
                    sx={{ ml: "auto" }}
                  >
                    {addingHeader ? (
                      <CircularProgress size={24} sx={{ mr: 1 }} />
                    ) : (
                      `Start Monitoring (${selectedCount}) Selected Headers`
                    )}
                  </Button>
                </CardActions>
              </Card>
            </Grid>
          );
        })}
      </Grid>
    </Box>
  );
};

export default Dashboard;
