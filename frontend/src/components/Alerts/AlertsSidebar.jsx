import React, { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  List,
  ListItem,
  Divider,
  Chip,
  Button,
  CircularProgress,
  Alert,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Tooltip,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import SnoozeIcon from "@mui/icons-material/Snooze";
import DeleteIcon from "@mui/icons-material/Delete";
import NotificationsOffIcon from "@mui/icons-material/NotificationsOff";
import ArrowRightIcon from "@mui/icons-material/ArrowRight";
import RefreshIcon from "@mui/icons-material/Refresh";
import { format } from "date-fns";
import { snoozeAlert, dismissAlert, fetchAlerts } from "../../store/slices/alertsSlice";
import { removeMonitoredHeader } from "../../store/slices/monitoredHeadersSlice";

// Snooze durations in seconds
const SNOOZE_DURATIONS = [
  { label: "15 minutes", value: 15 * 60 },
  { label: "1 hour", value: 60 * 60 },
  { label: "4 hours", value: 4 * 60 * 60 },
  { label: "8 hours", value: 8 * 60 * 60 },
  { label: "24 hours", value: 24 * 60 * 60 },
];

const AlertsSidebar = () => {
  const dispatch = useDispatch();
  const { alerts, loading, error } = useSelector((state) => state.alerts);
  const [snoozeAnchorEl, setSnoozeAnchorEl] = useState(null);
  const [selectedAlertId, setSelectedAlertId] = useState(null);
  console.log(alerts)
  // Auto-refresh alerts every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      dispatch(fetchAlerts());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const handleSnoozeClick = (event, alertId) => {
    setSnoozeAnchorEl(event.currentTarget);
    setSelectedAlertId(alertId);
  };

  const handleSnoozeClose = () => {
    setSnoozeAnchorEl(null);
    setSelectedAlertId(null);
  };

  const handleSnoozeAlert = (duration) => {
    if (selectedAlertId) {
      dispatch(snoozeAlert({ alertId: selectedAlertId, duration }));
      handleSnoozeClose();
    }
  };

  const handleDismissAlert = (alertId) => {
    dispatch(dismissAlert(alertId));
  };

  const handleRemoveHeader = (headerId) => {
    dispatch(removeMonitoredHeader(headerId));
  };

  const handleRefresh = () => {
    dispatch(fetchAlerts());
  };

  return (
    <>
      <Drawer
        anchor="right"
        variant="permanent"
        sx={{
          width: 350,
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: 350,
            boxSizing: "border-box",
          },
        }}
      >
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            p: 2,
            bgcolor: "primary.main",
            color: "white",
          }}
        >
          <Typography variant="h6">Active Alerts ({alerts?.length || 0})</Typography>
          <Tooltip title="Refresh alerts">
            <IconButton onClick={handleRefresh} color="inherit">
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>
        {/* 
        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
            <CircularProgress />
          </Box>
        )} */}

        {error && (
          <Box sx={{ p: 2 }}>
            <Alert severity="error">{error}</Alert>
          </Box>
        )}

        {!error && (!alerts || alerts.length === 0) && (
          <Box sx={{ p: 4, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <NotificationsOffIcon sx={{ fontSize: 48, color: "text.secondary" }} />
            <Typography variant="body1" color="text.secondary">
              No active alerts
            </Typography>
          </Box>
        )}

        <List sx={{ overflowY: "auto", pt: 0 }}>
          {alerts?.map((alert) => (
            <React.Fragment key={alert.id}>
              <ListItem sx={{ flexDirection: "column", alignItems: "flex-start", p: 2, bgcolor: "background.paper" }}>
                <Box sx={{ display: "flex", width: "100%", justifyContent: "space-between", mb: 1 }}>
                  <Typography
                    variant="subtitle1"
                    fontWeight="bold"
                    color={alert.type === "threshold" ? "error.main" : "warning.main"}
                  >
                    Alert
                  </Typography>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Tooltip title="Snooze notifications">
                      <IconButton
                        size="small"
                        onClick={(e) => handleSnoozeClick(e, alert.id)}
                        aria-label="Snooze notifications"
                      >
                        <SnoozeIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Remove header from monitoring">
                      <IconButton
                        size="small"
                        onClick={() => handleRemoveHeader(alert.headerId)}
                        aria-label="Stop monitoring"
                        color="error"
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Dismiss alert">
                      <IconButton size="small" onClick={() => handleDismissAlert(alert.id)} aria-label="Dismiss alert">
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>

                <Typography variant="body1">{alert.headerName}</Typography>

                <Typography variant="body2" color="text.secondary">
                  Stage: {alert.stageName || alert.stageId || "Unknown"}
                </Typography>

                <Typography
                  variant="body2"
                  color={alert.type === "threshold" ? "error.main" : "warning.main"}
                  fontWeight="bold"
                  sx={{ mt: 1 }}
                >
                  {alert.type === "threshold"
                    ? `Value ${alert.value} is ${alert.value < alert.threshold ? "below" : "above"} threshold (${
                        alert.threshold
                      })`
                    : `Value hasn't changed for ${alert.frozenDuration || 0} seconds`}
                </Typography>

                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                  {alert.timestamp ? format(new Date(alert.timestamp), "MM/dd/yyyy, h:mm a") : ""}
                </Typography>
              </ListItem>
              <Divider />
            </React.Fragment>
          ))}
        </List>
      </Drawer>

      {/* Snooze menu */}
      <Menu anchorEl={snoozeAnchorEl} open={Boolean(snoozeAnchorEl)} onClose={handleSnoozeClose}>
        <Typography variant="subtitle2" sx={{ px: 2, py: 1, fontWeight: "bold" }}>
          Snooze for:
        </Typography>
        {SNOOZE_DURATIONS.map((option) => (
          <MenuItem key={option.value} onClick={() => handleSnoozeAlert(option.value)}>
            <ListItemIcon>
              <ArrowRightIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{option.label}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};

export default AlertsSidebar;
