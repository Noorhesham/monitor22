import React, { useEffect, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Divider,
  Grid,
  CircularProgress,
  Alert,
  Chip,
  InputAdornment,
  Snackbar,
  IconButton,
  Card,
  CardHeader,
  CardContent,
  FormControlLabel,
  Switch,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import SaveIcon from "@mui/icons-material/Save";
import {
  fetchSettings,
  updateSettings,
  updatePatternCategories,
  clearSettingsUpdated,
} from "../store/slices/settingsSlice";

const Settings = () => {
  const dispatch = useDispatch();
  const { settings, loading, error, updated } = useSelector((state) => state.settings);
  const [localSettings, setLocalSettings] = useState({});
  const [newPressurePattern, setNewPressurePattern] = useState("");
  const [newPressureNegativePattern, setNewPressureNegativePattern] = useState("");
  const [newBatteryPattern, setNewBatteryPattern] = useState("");
  const [newBatteryNegativePattern, setNewBatteryNegativePattern] = useState("");
  const [newWebhookUrl, setNewWebhookUrl] = useState("");
  const [snackbarOpen, setSnackbarOpen] = useState(false);

  useEffect(() => {
    dispatch(fetchSettings());
  }, [dispatch]);

  useEffect(() => {
    // If settings is available, initialize localSettings
    if (settings) {
      // Don't re-initialize if already done
      if (Object.keys(localSettings).length > 0) {
        return;
      }

      const settingsCopy = JSON.parse(JSON.stringify(settings));

      // Ensure pattern categories exist and are properly initialized
      if (!settingsCopy.patternCategories) {
        settingsCopy.patternCategories = {};
      }

      // Ensure pressure category
      if (!settingsCopy.patternCategories.pressure) {
        settingsCopy.patternCategories.pressure = {
          patterns: [],
          negativePatterns: [],
          threshold: 100,
          alertDuration: 120,
          frozenThreshold: 60,
        };
      } else {
        // Ensure arrays exist
        if (!Array.isArray(settingsCopy.patternCategories.pressure.patterns)) {
          settingsCopy.patternCategories.pressure.patterns = [];
        }
        if (!Array.isArray(settingsCopy.patternCategories.pressure.negativePatterns)) {
          settingsCopy.patternCategories.pressure.negativePatterns = [];
        }
      }

      // Ensure battery category
      if (!settingsCopy.patternCategories.battery) {
        settingsCopy.patternCategories.battery = {
          patterns: [],
          negativePatterns: [],
          threshold: 20,
          alertDuration: 300,
          frozenThreshold: 300,
        };
      } else {
        // Ensure arrays exist
        if (!Array.isArray(settingsCopy.patternCategories.battery.patterns)) {
          settingsCopy.patternCategories.battery.patterns = [];
        }
        if (!Array.isArray(settingsCopy.patternCategories.battery.negativePatterns)) {
          settingsCopy.patternCategories.battery.negativePatterns = [];
        }
      }

      // Ensure webhooks configuration exists
      if (!settingsCopy.webhooks) {
        settingsCopy.webhooks = {
          enabled: false,
          slackEnabled: false,
          teamsEnabled: false,
          customWebhooks: [],
          sendThresholdAlerts: true,
          sendFrozenAlerts: true,
          sendErrorAlerts: true,
        };
      } else if (!Array.isArray(settingsCopy.webhooks.customWebhooks)) {
        settingsCopy.webhooks.customWebhooks = [];
      }

      setLocalSettings(settingsCopy);
    }
  }, [settings]);

  useEffect(() => {
    if (updated) {
      setSnackbarOpen(true);
      // Clear the updated flag after showing the snackbar
      setTimeout(() => {
        dispatch(clearSettingsUpdated());
      }, 3000);
    }
  }, [updated, dispatch]);

  const handleSettingChange = (categoryPath, setting, value) => {
    setLocalSettings((prevSettings) => {
      const newSettings = JSON.parse(JSON.stringify(prevSettings)); // Deep copy
      let currentLevel = newSettings;

      // Navigate through the category path if provided
      if (categoryPath) {
        const pathParts = categoryPath.split(".");
        for (let i = 0; i < pathParts.length; i++) {
          const part = pathParts[i];
          if (!currentLevel[part]) {
            // Initialize intermediate objects/arrays if they don't exist
            currentLevel[part] =
              i === pathParts.length - 1 && (setting === "patterns" || setting === "negativePatterns") ? [] : {};
          }
          // If it's the last part, set the setting there
          if (i === pathParts.length - 1) {
            currentLevel = currentLevel[part];
          } else {
            currentLevel = currentLevel[part];
          }
        }
      }

      // Set the actual value
      currentLevel[setting] = value;

      return newSettings;
    });
  };

  const handlePatternChange = (category, patternType, index, value) => {
    setLocalSettings((prevSettings) => {
      const newSettings = JSON.parse(JSON.stringify(prevSettings)); // Deep copy
      if (newSettings.patternCategories?.[category]?.[patternType]?.[index] !== undefined) {
        newSettings.patternCategories[category][patternType][index] = value;
      }
      return newSettings;
    });
  };

  const handleAddPattern = (category, patternType) => {
    let pattern = "";
    let setPatternState = () => {};

    // Determine which pattern state to use and clear
    if (category === "pressure" && patternType === "patterns") {
      pattern = newPressurePattern;
      setPatternState = setNewPressurePattern;
    } else if (category === "pressure" && patternType === "negativePatterns") {
      pattern = newPressureNegativePattern;
      setPatternState = setNewPressureNegativePattern;
    } else if (category === "battery" && patternType === "patterns") {
      pattern = newBatteryPattern;
      setPatternState = setNewBatteryPattern;
    } else if (category === "battery" && patternType === "negativePatterns") {
      pattern = newBatteryNegativePattern;
      setPatternState = setNewBatteryNegativePattern;
    }

    const trimmedPattern = pattern.trim();
    if (!trimmedPattern) return;

    setLocalSettings((prevSettings) => {
      const newSettings = JSON.parse(JSON.stringify(prevSettings)); // Deep copy

      // Ensure category exists
      if (!newSettings.patternCategories) {
        newSettings.patternCategories = {};
      }
      if (!newSettings.patternCategories[category]) {
        newSettings.patternCategories[category] = {};
      }

      // Ensure the specific pattern array (patterns or negativePatterns) exists
      if (!Array.isArray(newSettings.patternCategories[category][patternType])) {
        newSettings.patternCategories[category][patternType] = [];
      }

      // Add the pattern if it doesn't already exist
      if (!newSettings.patternCategories[category][patternType].includes(trimmedPattern)) {
        newSettings.patternCategories[category][patternType].push(trimmedPattern);
      }

      return newSettings;
    });

    // Clear the input field
    setPatternState("");

    // Save the changes immediately
    if (localSettings.patternCategories) {
      dispatch(updatePatternCategories(localSettings.patternCategories));
    }
  };

  const handleRemovePattern = (category, patternType, index) => {
    setLocalSettings((prevSettings) => {
      const newSettings = JSON.parse(JSON.stringify(prevSettings)); // Deep copy
      if (newSettings.patternCategories?.[category]?.[patternType]?.[index] !== undefined) {
        newSettings.patternCategories[category][patternType].splice(index, 1);
      }
      return newSettings;
    });
  };

  const handleAddCustomWebhook = () => {
    const trimmedUrl = newWebhookUrl.trim();
    if (!trimmedUrl.startsWith("http")) return;

    setLocalSettings((prevSettings) => {
      const newSettings = JSON.parse(JSON.stringify(prevSettings)); // Deep copy

      // Ensure webhooks configuration exists
      if (!newSettings.webhooks) {
        newSettings.webhooks = { customWebhooks: [] };
      }

      // Ensure custom webhooks array exists
      if (!Array.isArray(newSettings.webhooks.customWebhooks)) {
        newSettings.webhooks.customWebhooks = [];
      }

      // Add the webhook if it doesn't already exist
      if (!newSettings.webhooks.customWebhooks.includes(trimmedUrl)) {
        newSettings.webhooks.customWebhooks.push(trimmedUrl);
      }

      return newSettings;
    });

    setNewWebhookUrl("");

    // Save the changes immediately
    handleSaveSettings();
  };

  const handleRemoveCustomWebhook = (index) => {
    setLocalSettings((prevSettings) => {
      const newSettings = JSON.parse(JSON.stringify(prevSettings)); // Deep copy

      if (
        Array.isArray(newSettings.webhooks?.customWebhooks) &&
        index >= 0 &&
        index < newSettings.webhooks.customWebhooks.length
      ) {
        newSettings.webhooks.customWebhooks.splice(index, 1);
      }

      return newSettings;
    });

    // Save the changes immediately
    handleSaveSettings();
  };

  const handleSaveSettings = () => {
    // Exclude patternCategories when saving global settings
    const { patternCategories, ...globalSettings } = localSettings;
    dispatch(updateSettings(globalSettings));
  };

  const handleSavePatterns = () => {
    // Only send patternCategories when saving patterns
    if (localSettings.patternCategories) {
      dispatch(updatePatternCategories(localSettings.patternCategories));
    } else {
      console.error("Attempted to save patterns, but patternCategories is missing.");
    }
  };

  const handleCloseSnackbar = () => {
    setSnackbarOpen(false);
  };

  // Show loading spinner only when initially loading, not when localSettings is empty
  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "400px" }}>
        <CircularProgress />
      </Box>
    );
  }

  // Initialize localSettings with defaults if we're not loading but settings are missing
  if (!loading && !error && !settings && Object.keys(localSettings).length === 0) {
    const defaultSettings = {
      pollingInterval: 5,
      patternCategories: {
        pressure: {
          patterns: [],
          negativePatterns: [],
          threshold: 100,
          alertDuration: 120,
          frozenThreshold: 60,
        },
        battery: {
          patterns: [],
          negativePatterns: [],
          threshold: 20,
          alertDuration: 300,
          frozenThreshold: 300,
        },
      },
      webhooks: {
        enabled: false,
        slackEnabled: false,
        teamsEnabled: false,
        customWebhooks: [],
        sendThresholdAlerts: true,
        sendFrozenAlerts: true,
        sendErrorAlerts: true,
      },
    };

    setLocalSettings(defaultSettings);
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "400px" }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ my: 2 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  // Make sure we have localSettings before proceeding
  if (Object.keys(localSettings).length === 0) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "400px" }}>
        <CircularProgress />
      </Box>
    );
  }

  // Use optional chaining for safer access
  const pollingInterval = localSettings?.pollingInterval || 5;
  const webhooksConfig = localSettings?.webhooks || {};
  const pressurePatterns = localSettings?.patternCategories?.pressure || {};
  const batteryPatterns = localSettings?.patternCategories?.battery || {};

  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        Settings
      </Typography>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={handleCloseSnackbar}
        message="Settings saved successfully"
        action={
          <IconButton size="small" color="inherit" onClick={handleCloseSnackbar}>
            <CloseIcon fontSize="small" />
          </IconButton>
        }
      />

      <Grid container spacing={3}>
        {/* Global Settings */}
        <Grid item xs={12}>
          <Card>
            <CardHeader
              title="Global Settings"
              action={
                <Button variant="contained" startIcon={<SaveIcon />} onClick={handleSaveSettings} disabled={loading}>
                  {loading ? <CircularProgress size={24} /> : "Save Settings"}
                </Button>
              }
            />
            <Divider />
            <CardContent>
              <Grid container spacing={3}>
                <Grid item xs={12} sm={6} md={4}>
                  <TextField
                    label="Polling Interval (seconds)"
                    type="number"
                    fullWidth
                    value={pollingInterval}
                    onChange={(e) => handleSettingChange(null, "pollingInterval", parseInt(e.target.value) || 0)}
                    InputProps={{
                      endAdornment: <InputAdornment position="end">seconds</InputAdornment>,
                    }}
                    helperText="How often to check for new values"
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Webhook Settings */}
        <Grid item xs={12}>
          <Card>
            <CardHeader title="Notifications" />
            <Divider />
            <CardContent>
              <Grid container spacing={3}>
                <Grid item xs={12} sm={6}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={webhooksConfig.enabled || false}
                        onChange={(e) => handleSettingChange("webhooks", "enabled", e.target.checked)}
                      />
                    }
                    label="Enable Notifications"
                  />
                </Grid>

                <Grid item xs={12} sm={6}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={webhooksConfig.slackEnabled || false}
                        onChange={(e) => handleSettingChange("webhooks", "slackEnabled", e.target.checked)}
                        disabled={!webhooksConfig.enabled}
                      />
                    }
                    label="Slack Notifications"
                  />
                </Grid>

                <Grid item xs={12} sm={6}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={webhooksConfig.teamsEnabled || false}
                        onChange={(e) => handleSettingChange("webhooks", "teamsEnabled", e.target.checked)}
                        disabled={!webhooksConfig.enabled}
                      />
                    }
                    label="Microsoft Teams Notifications"
                  />
                </Grid>

                <Grid item xs={12}>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle1" gutterBottom>
                    Notification Settings
                  </Typography>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={webhooksConfig.sendThresholdAlerts || false}
                        onChange={(e) => handleSettingChange("webhooks", "sendThresholdAlerts", e.target.checked)}
                        disabled={!webhooksConfig.enabled}
                      />
                    }
                    label="Send Threshold Alerts"
                  />
                </Grid>

                <Grid item xs={12} sm={6}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={webhooksConfig.sendFrozenAlerts || false}
                        onChange={(e) => handleSettingChange("webhooks", "sendFrozenAlerts", e.target.checked)}
                        disabled={!webhooksConfig.enabled}
                      />
                    }
                    label="Send Frozen Data Alerts"
                  />
                </Grid>

                <Grid item xs={12} sm={6}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={webhooksConfig.sendErrorAlerts || false}
                        onChange={(e) => handleSettingChange("webhooks", "sendErrorAlerts", e.target.checked)}
                        disabled={!webhooksConfig.enabled}
                      />
                    }
                    label="Send Error Alerts"
                  />
                </Grid>

                {webhooksConfig.slackEnabled && (
                  <Grid item xs={12}>
                    <TextField
                      label="Slack Webhook URL"
                      fullWidth
                      value={webhooksConfig.slackWebhookUrl || ""}
                      onChange={(e) => handleSettingChange("webhooks", "slackWebhookUrl", e.target.value)}
                      disabled={!webhooksConfig.enabled || !webhooksConfig.slackEnabled}
                      placeholder="https://hooks.slack.com/services/..."
                    />
                  </Grid>
                )}

                {webhooksConfig.teamsEnabled && (
                  <Grid item xs={12}>
                    <TextField
                      label="Microsoft Teams Webhook URL"
                      fullWidth
                      value={webhooksConfig.teamsWebhookUrl || ""}
                      onChange={(e) => handleSettingChange("webhooks", "teamsWebhookUrl", e.target.value)}
                      disabled={!webhooksConfig.enabled || !webhooksConfig.teamsEnabled}
                      placeholder="https://outlook.office.com/webhook/..."
                    />
                  </Grid>
                )}

                {/* Custom Webhooks */}
                <Grid item xs={12}>
                  <Typography variant="subtitle1" gutterBottom sx={{ mt: 2 }}>
                    Custom Webhooks
                  </Typography>

                  <Box sx={{ display: "flex", mb: 2 }}>
                    <TextField
                      label="Webhook URL"
                      fullWidth
                      value={newWebhookUrl}
                      onChange={(e) => setNewWebhookUrl(e.target.value)}
                      disabled={!webhooksConfig.enabled}
                      placeholder="https://example.com/webhook"
                      sx={{ mr: 1 }}
                    />
                    <Button
                      variant="contained"
                      onClick={handleAddCustomWebhook}
                      disabled={!webhooksConfig.enabled || !newWebhookUrl.trim().startsWith("http")}
                      startIcon={<AddIcon />}
                    >
                      Add
                    </Button>
                  </Box>

                  <List>
                    {Array.isArray(webhooksConfig.customWebhooks) &&
                      webhooksConfig.customWebhooks.map((webhook, index) => (
                        <ListItem key={index} divider>
                          <ListItemText primary={webhook} />
                          <ListItemSecondaryAction>
                            <IconButton edge="end" aria-label="delete" onClick={() => handleRemoveCustomWebhook(index)}>
                              <DeleteIcon />
                            </IconButton>
                          </ListItemSecondaryAction>
                        </ListItem>
                      ))}
                    {(!Array.isArray(webhooksConfig.customWebhooks) || webhooksConfig.customWebhooks.length === 0) && (
                      <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
                        No custom webhooks configured
                      </Typography>
                    )}
                  </List>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Pattern Categories */}
        <Grid item xs={12}>
          <Card>
            <CardHeader
              title="Pattern Categories"
              action={
                <Button variant="contained" startIcon={<SaveIcon />} onClick={handleSavePatterns} disabled={loading}>
                  {loading ? <CircularProgress size={24} /> : "Save Patterns"}
                </Button>
              }
            />
            <Divider />
            <CardContent>
              <Grid container spacing={3}>
                {/* Pressure Patterns */}
                <Grid item xs={12} md={6}>
                  <Typography variant="h6" gutterBottom>
                    Pressure Patterns
                  </Typography>

                  <TextField
                    label="Default Threshold"
                    type="number"
                    fullWidth
                    value={pressurePatterns.threshold || ""}
                    onChange={(e) =>
                      handleSettingChange("patternCategories.pressure", "threshold", parseInt(e.target.value) || 0)
                    }
                    margin="normal"
                    helperText="Default pressure threshold (can be overridden per header)"
                  />

                  <TextField
                    label="Alert Duration (seconds)"
                    type="number"
                    fullWidth
                    value={pressurePatterns.alertDuration || ""}
                    onChange={(e) =>
                      handleSettingChange("patternCategories.pressure", "alertDuration", parseInt(e.target.value) || 0)
                    }
                    margin="normal"
                    helperText="How long pressure must stay below threshold before alerting (per header)"
                  />

                  <TextField
                    label="Frozen Threshold (seconds)"
                    type="number"
                    fullWidth
                    value={pressurePatterns.frozenThreshold || ""}
                    onChange={(e) =>
                      handleSettingChange(
                        "patternCategories.pressure",
                        "frozenThreshold",
                        parseInt(e.target.value) || 0
                      )
                    }
                    margin="normal"
                    helperText="How long pressure value can remain unchanged before alerting (per header)"
                  />

                  <TextField
                    label="Notification Interval (seconds)"
                    type="number"
                    fullWidth
                    value={pressurePatterns.notificationInterval || "300"}
                    onChange={(e) =>
                      handleSettingChange(
                        "patternCategories.pressure",
                        "notificationInterval",
                        parseInt(e.target.value) || 300
                      )
                    }
                    margin="normal"
                    helperText="Minimum time between repeated notifications for the same header"
                    InputProps={{
                      endAdornment: <InputAdornment position="end">seconds</InputAdornment>,
                    }}
                  />

                  <Typography variant="subtitle1" sx={{ mt: 3, mb: 1 }}>
                    Include Patterns
                  </Typography>

                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 2 }}>
                    {Array.isArray(pressurePatterns.patterns) &&
                      pressurePatterns.patterns.map((pattern, index) => (
                        <Chip
                          key={`pressure-pattern-${index}`}
                          label={pattern}
                          className="pattern-chip include"
                          onDelete={() => handleRemovePattern("pressure", "patterns", index)}
                        />
                      ))}
                  </Box>

                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 3 }}>
                    <TextField
                      size="small"
                      value={newPressurePattern}
                      onChange={(e) => setNewPressurePattern(e.target.value)}
                      placeholder="Add new pattern..."
                      sx={{ flexGrow: 1 }}
                    />
                    <Button
                      startIcon={<AddIcon />}
                      onClick={() => handleAddPattern("pressure", "patterns")}
                      disabled={!newPressurePattern.trim()}
                    >
                      Add
                    </Button>
                  </Box>

                  <Typography variant="subtitle1" sx={{ mt: 3, mb: 1 }}>
                    Exclude Patterns
                  </Typography>

                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 2 }}>
                    {Array.isArray(pressurePatterns.negativePatterns) &&
                      pressurePatterns.negativePatterns.map((pattern, index) => (
                        <Chip
                          key={`pressure-negative-${index}`}
                          label={pattern}
                          className="pattern-chip exclude"
                          onDelete={() => handleRemovePattern("pressure", "negativePatterns", index)}
                        />
                      ))}
                  </Box>

                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <TextField
                      size="small"
                      value={newPressureNegativePattern}
                      onChange={(e) => setNewPressureNegativePattern(e.target.value)}
                      placeholder="Add exclusion pattern..."
                      sx={{ flexGrow: 1 }}
                    />
                    <Button
                      startIcon={<AddIcon />}
                      onClick={() => handleAddPattern("pressure", "negativePatterns")}
                      disabled={!newPressureNegativePattern.trim()}
                    >
                      Add
                    </Button>
                  </Box>
                </Grid>

                {/* Battery Patterns */}
                <Grid item xs={12} md={6}>
                  <Typography variant="h6" gutterBottom>
                    Battery Patterns
                  </Typography>

                  <TextField
                    label="Default Threshold"
                    type="number"
                    fullWidth
                    value={batteryPatterns.threshold || ""}
                    onChange={(e) =>
                      handleSettingChange("patternCategories.battery", "threshold", parseInt(e.target.value) || 0)
                    }
                    margin="normal"
                    helperText="Default battery level threshold (can be overridden per header)"
                  />

                  <TextField
                    label="Alert Duration (seconds)"
                    type="number"
                    fullWidth
                    value={batteryPatterns.alertDuration || ""}
                    onChange={(e) =>
                      handleSettingChange("patternCategories.battery", "alertDuration", parseInt(e.target.value) || 0)
                    }
                    margin="normal"
                    helperText="How long battery must stay below threshold before alerting (per header)"
                  />

                  <TextField
                    label="Frozen Threshold (seconds)"
                    type="number"
                    fullWidth
                    value={batteryPatterns.frozenThreshold || ""}
                    onChange={(e) =>
                      handleSettingChange("patternCategories.battery", "frozenThreshold", parseInt(e.target.value) || 0)
                    }
                    margin="normal"
                    helperText="How long battery value can remain unchanged before alerting (per header)"
                  />

                  <TextField
                    label="Notification Interval (seconds)"
                    type="number"
                    fullWidth
                    value={batteryPatterns.notificationInterval || "300"}
                    onChange={(e) =>
                      handleSettingChange(
                        "patternCategories.battery",
                        "notificationInterval",
                        parseInt(e.target.value) || 300
                      )
                    }
                    margin="normal"
                    helperText="Minimum time between repeated notifications for the same header"
                    InputProps={{
                      endAdornment: <InputAdornment position="end">seconds</InputAdornment>,
                    }}
                  />

                  <Typography variant="subtitle1" sx={{ mt: 3, mb: 1 }}>
                    Include Patterns
                  </Typography>

                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 2 }}>
                    {Array.isArray(batteryPatterns.patterns) &&
                      batteryPatterns.patterns.map((pattern, index) => (
                        <Chip
                          key={`battery-pattern-${index}`}
                          label={pattern}
                          className="pattern-chip include"
                          onDelete={() => handleRemovePattern("battery", "patterns", index)}
                        />
                      ))}
                  </Box>

                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <TextField
                      size="small"
                      value={newBatteryPattern}
                      onChange={(e) => setNewBatteryPattern(e.target.value)}
                      placeholder="Add new pattern..."
                      sx={{ flexGrow: 1 }}
                    />
                    <Button
                      startIcon={<AddIcon />}
                      onClick={() => handleAddPattern("battery", "patterns")}
                      disabled={!newBatteryPattern.trim()}
                    >
                      Add
                    </Button>
                  </Box>

                  <Typography variant="subtitle1" sx={{ mt: 3, mb: 1 }}>
                    Exclude Patterns
                  </Typography>

                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 2 }}>
                    {Array.isArray(batteryPatterns.negativePatterns) &&
                      batteryPatterns.negativePatterns.map((pattern, index) => (
                        <Chip
                          key={`battery-negative-${index}`}
                          label={pattern}
                          className="pattern-chip exclude"
                          onDelete={() => handleRemovePattern("battery", "negativePatterns", index)}
                        />
                      ))}
                  </Box>

                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <TextField
                      size="small"
                      value={newBatteryNegativePattern}
                      onChange={(e) => setNewBatteryNegativePattern(e.target.value)}
                      placeholder="Add exclusion pattern..."
                      sx={{ flexGrow: 1 }}
                    />
                    <Button
                      startIcon={<AddIcon />}
                      onClick={() => handleAddPattern("battery", "negativePatterns")}
                      disabled={!newBatteryNegativePattern.trim()}
                    >
                      Add
                    </Button>
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Settings;
