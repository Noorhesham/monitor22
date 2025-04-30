import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { AlertCircle, EyeIcon, BellIcon, CheckSquare, Square, Play, Pause, X, Settings, Clock } from "lucide-react";
import { useSettings } from "../../contexts/SettingsContext.jsx";
import { useNavigate } from "react-router-dom";
import { API_CONFIG, getAuthHeaders } from "../../config";
// Import Hooks
import useStageData from "./hooks/useStageData";
import useMonitoring from "./hooks/useMonitoring";
import JobMonitoringPanel from "./components/JobMonitoringPanel";
import ActiveProjectsList from "./components/ActiveProjectsList";
// Import Utils
import { matchPatterns } from "./utils/patterns";
import { SNOOZE_DURATIONS } from "./constants";
// Import new ActiveAlertPanel
import ActiveAlertPanel from "./components/ActiveAlertPanel";
import { Box, Container, Paper, Tab, Tabs } from "@mui/material";
import HeaderSelector from "./HeaderSelector";
import MonitoringView from "./MonitoringView";
import { Row, Col, Card, Button, Alert, Table, Badge } from "react-bootstrap";
import { Link } from "react-router-dom";
import axios from "axios";

// localStorage keys
const LS_SELECTED_HEADERS = "monitoring_selectedHeaders";
const LS_THRESHOLDS = "monitoring_thresholds";
const LS_MONITORING_STATUS = "monitoring_projectStatus";

// Debug mode
const DEBUG_MODE = true;

// Component renamed to Dashboard
const Dashboard = () => {
  const navigate = useNavigate();
  const {
    patternCategories,
    isLoadingSettings,
    settingsError,
    headerThresholdsData, // Get thresholds from context
    setHeaderSettings, // Get setter from context
  } = useSettings();

  // State for fetched monitoring status
  const [status, setStatus] = useState({
    headerValues: {},
    alerts: [],
    lastUpdated: null,
  });
  const [activeJobs, setActiveJobs] = useState([]);
  const [activeStages, setActiveStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Stage Data Hook (depends on patternCategories)
  const {
    headersByStage,
    headerMappings,
    loading: isLoadingStages,
    error: stagesError,
  } = useStageData(isLoadingSettings ? null : { patternCategories }); // Pass null if settings are loading

  // Fetch status data on load and periodically
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        setError(null);
        const response = await axios.get(API_CONFIG.statusUrl, {
          headers: getAuthHeaders(),
        });
        console.log(response);
        setStatus(response.data);
        setLoading(false);
      } catch (err) {
        console.error("Error fetching status:", err);
        setError("Failed to fetch monitoring status");
        setLoading(false);
      }
    };
    console.log("activeStages status...", status);
    // Fetch active stages
    console.log("activeStages", activeStages);

    const fetchActiveStages = async () => {
      try {
        setJobsLoading(true);
        const response = await axios.get(`${API_CONFIG.baseUrl}/api/stages/active/stages`, {
          headers: getAuthHeaders(),
        });
        console.log(response);

        if (response.data && response.data.stages) {
          setActiveStages(response.data.stages);
          // Process jobs from stages
          const jobs = {};
          response.data.stages.forEach((stage) => {
            const jobKey = `${stage.projectId}_${stage.companyId}`;
            if (!jobs[jobKey]) {
              jobs[jobKey] = {
                projectId: stage.projectId,
                projectName: stage.projectName,
                companyName: stage.companyName,
                stages: [],
              };
            }
            jobs[jobKey].stages.push(stage);
          });

          setActiveJobs(Object.values(jobs));
        }
        setJobsLoading(false);
        console.log(`actiev jobs`, activeJobs);
      } catch (err) {
        console.error("Error fetching active stages:", err);
        setJobsLoading(false);
      }
    };

    // Initial fetch
    fetchStatus();
    fetchActiveStages();

    // Get polling interval from settings (default to 5 seconds)
    const pollingIntervalMs = (patternCategories?.pollingInterval || 5) * 1000;
    console.log(`Dashboard setting up polling interval: ${pollingIntervalMs}ms`);

    // Set up polling with the configured interval
    const statusInterval = setInterval(fetchStatus, pollingIntervalMs);
    const stagesInterval = setInterval(fetchActiveStages, pollingIntervalMs * 3); // Fetch stages less frequently

    // Clean up
    return () => {
      clearInterval(statusInterval);
      clearInterval(stagesInterval);
    };
  }, []);

  // Loading and error states
  const isLoading = isLoadingSettings || isLoadingStages || loading;

  // Handle threshold changes using context setter
  const handleThresholdChange = useCallback(
    (headerId, value) => {
      const numericValue = Number(value);
      // Allow empty string to represent null/unset
      const validValue = value === "" ? null : isNaN(numericValue) ? undefined : numericValue;

      if (validValue !== undefined) {
        if (DEBUG_MODE) console.log(`Setting threshold for ${headerId} to:`, validValue);
        // Use the setter from context - it handles API call and state update
        setHeaderSettings(headerId, { threshold: validValue });
      } else {
        console.warn(`Invalid threshold value entered: ${value}`);
      }
    },
    [setHeaderSettings]
  ); // Use context setter

  // Get all currently monitored headers across all jobs
  const monitoredHeaders = useMemo(() => {
    const headerSet = new Set();
    Object.values(activeJobs).forEach((job) => {
      const currentStageId = job.currentStage?.stageId;
      if (currentStageId) {
        const projectStorageKey = `selectedHeaders_${job.projectId}`;
        try {
          const savedHeaders = localStorage.getItem(projectStorageKey);
          if (savedHeaders) {
            const parsedHeaders = JSON.parse(savedHeaders);
            parsedHeaders.forEach((headerId) => headerSet.add(headerId));
          }
        } catch (error) {
          console.error("Error loading selected headers from localStorage:", error);
        }
      }
    });
    return headerSet;
  }, [activeJobs]);

  // Filter alerts to only show those for monitored headers
  const filteredAlerts = useMemo(() => {
    return status.alerts.filter((alert) => {
      return monitoredHeaders.has(alert.headerId);
    });
  }, [status.alerts, monitoredHeaders]);

  // Add function to dismiss alerts
  const dismissAlert = useCallback((alertId) => {
    setStatus((prev) => ({
      ...prev,
      alerts: prev.alerts.filter((a) => a.id !== alertId),
    }));
  }, []);

  const [activeTab, setActiveTab] = useState(0);
  const [selectedMonitoredHeaders, setSelectedMonitoredHeaders] = useState([]);

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  const handleHeadersConfigured = (headers) => {
    setSelectedMonitoredHeaders(headers);
    setActiveTab(1); // Switch to monitoring view
  };

  if (isLoading && !status.lastUpdated) {
    // Show loading only initially
    return <div className="p-4 text-center">Loading dashboard data...</div>;
  }

  if (error) {
    return <div className="p-4 text-center text-red-600">Error: {error}</div>;
  }

  // Ensure activeJobs is populated before rendering panels
  if (Object.keys(activeJobs).length === 0 && !isLoadingStages) {
    return <div className="p-4 text-center text-gray-600">No active jobs found.</div>;
  }

  return (
    <Container className="mt-4">
      <Row className="mb-4">
        <Col>
          <h1>Monitoring Dashboard</h1>
          <p className="text-muted">
            Status as of: {status.lastUpdated ? new Date(status.lastUpdated).toLocaleString() : "Loading..."}
          </p>
        </Col>
        <Col xs="auto">
          <Button as={Link} to="/settings" variant="primary">
            Settings
          </Button>
        </Col>
      </Row>

      {error && <Alert variant="danger">{error}</Alert>}

      <Row>
        <Col md={6}>
          <Card className="mb-4">
            <Card.Header>
              <h5 className="mb-0">System Status</h5>
            </Card.Header>
            <Card.Body>
              {loading ? (
                <p>Loading status...</p>
              ) : (
                <>
                  <p>
                    <strong>Active Alerts:</strong> {status.alerts.length}
                  </p>
                  <p>
                    <strong>Monitored Headers:</strong> {Object.keys(status.headerValues).length}
                  </p>
                </>
              )}
            </Card.Body>
          </Card>
        </Col>

        <Col md={6}>
          <Card className="mb-4">
            <Card.Header>
              <h5 className="mb-0">Active Alerts</h5>
            </Card.Header>
            <Card.Body>
              {loading ? (
                <p>Loading alerts...</p>
              ) : status.alerts.length > 0 ? (
                <ul className="list-group">
                  {status.alerts.map((alert, index) => (
                    <li key={index} className="list-group-item">
                      <strong>{alert.headerName}</strong>: {alert.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No active alerts at this time.</p>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row>
        <Col>
          <Card className="mb-4">
            <Card.Header>
              <h5 className="mb-0">Active Jobs</h5>
            </Card.Header>
            <Card.Body>
              {jobsLoading ? (
                <p>Loading jobs...</p>
              ) : activeJobs.length > 0 ? (
                <Table striped responsive>
                  <thead>
                    <tr>
                      <th>Project</th>
                      <th>Company</th>
                      <th>Stages</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeJobs.map((job, index) => (
                      <tr key={index}>
                        <td>{job.projectName}</td>
                        <td>{job.companyName}</td>
                        <td>{job.stages.length}</td>
                        <td>
                          <Badge bg="success">Active</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              ) : (
                <p>No active jobs found.</p>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row>
        <Col>
          <Card className="mb-4">
            <Card.Header>
              <h5 className="mb-0">Active Stages</h5>
            </Card.Header>
            <Card.Body>
              {jobsLoading ? (
                <p>Loading stages...</p>
              ) : activeStages.length > 0 ? (
                <Table striped responsive>
                  <thead>
                    <tr>
                      <th>Stage</th>
                      <th>Project</th>
                      <th>Well</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeStages.map((stage, index) => (
                      <tr key={index}>
                        <td>{stage.stageName}</td>
                        <td>{stage.projectName}</td>
                        <td>{stage.wellNumber}</td>
                        <td>{new Date(stage.createdAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              ) : (
                <p>No active stages found.</p>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default Dashboard;
