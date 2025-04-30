// Shared settings schema between frontend and backend
export const DEFAULT_SETTINGS = {
  pollingInterval: 5,
  patternCategories: {
    pressure: {
      patterns: ["pressure", "casing", "tubing", "cbt"],
      negativePatterns: [
        "fdi", "derivative", "projected", "curve", "predicted", "qc",
        "pumpdown", "treating", "inverse", "hydrostatic", "measuredpressure",
        "natural", "gas", "seal", "p-seal"
      ],
      threshold: 20,
      alertDuration: 20,
      frozenThreshold: 120,
      notificationInterval: 300 // 5 minutes between notifications per header
    },
    battery: {
      patterns: ["bat", "battery"],
      threshold: 20,
      alertDuration: 120,
      notificationInterval: 300 // 5 minutes between notifications per header
    }
  },
  webhooks: {
    enabled: false,
    slackEnabled: false,
    teamsEnabled: false,
    slackWebhookUrl: "",
    teamsWebhookUrl: "",
    customWebhooks: [],
    sendThresholdAlerts: true,
    sendFrozenAlerts: true,
    sendErrorAlerts: true
  },
  snoozeSettings: {}
};

export const validateSettings = (settings) => {
  const errors = [];
  
  // Check required fields
  if (!settings.pollingInterval || typeof settings.pollingInterval !== 'number') {
    errors.push('Invalid polling interval');
  }
  
  if (!settings.patternCategories?.pressure?.patterns?.length) {
    errors.push('Missing pressure patterns');
  }
  
  if (!settings.patternCategories?.battery?.patterns?.length) {
    errors.push('Missing battery patterns');
  }
  
  // Validate thresholds
  if (settings.patternCategories?.pressure?.threshold !== null &&
      (typeof settings.patternCategories?.pressure?.threshold !== 'number' ||
       settings.patternCategories.pressure.threshold < 0)) {
    errors.push('Invalid pressure threshold');
  }
  
  if (settings.patternCategories?.battery?.threshold !== null &&
      (typeof settings.patternCategories?.battery?.threshold !== 'number' ||
       settings.patternCategories.battery.threshold < 0 ||
       settings.patternCategories.battery.threshold > 100)) {
    errors.push('Invalid battery threshold');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
};

export const mergeWithDefaults = (settings) => {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    patternCategories: {
      pressure: {
        ...DEFAULT_SETTINGS.patternCategories.pressure,
        ...(settings.patternCategories?.pressure || {})
      },
      battery: {
        ...DEFAULT_SETTINGS.patternCategories.battery,
        ...(settings.patternCategories?.battery || {})
      }
    },
    webhooks: {
      ...DEFAULT_SETTINGS.webhooks,
      ...(settings.webhooks || {})
    }
  };
}; 