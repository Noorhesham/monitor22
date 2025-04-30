// Default settings configuration
export const DEFAULT_SETTINGS = {
  pollingInterval: 5, // seconds
  patternCategories: {
    pressure: {
      patterns: ['pressure', 'psi', 'tubing', 'casing'],
      negativePatterns: ['atmospheric', 'atm'],
      threshold: 20,
      alertDuration: 20,
      frozenThreshold: 120
    },
    battery: {
      patterns: ['battery', 'batt', 'volt'],
      threshold: 20,
      alertDuration: 300,
      frozenThreshold: 300
    }
  },
  webhooks: {
    enabled: false,
    slackEnabled: true,
    emailEnabled: false,
    teamsEnabled: false,
    slackWebhookUrl: "",
    emailRecipients: "",
    teamsWebhookUrl: "",
    sendThresholdAlerts: true,
    sendFrozenAlerts: true,
    sendErrorAlerts: true,
    interval: 3600000 // 1 hour in milliseconds
  },
  snoozeSettings: {}
};

// Validate settings object
export function validateSettings(settings) {
  try {
    // Check if settings is an object
    if (!settings || typeof settings !== 'object') {
      return { valid: false, errors: ['Settings must be an object'] };
    }

    const errors = [];

    // Validate polling interval
    if (typeof settings.pollingInterval !== 'number' || settings.pollingInterval < 1) {
      errors.push('Polling interval must be a positive number');
    }

    // Validate pattern categories
    if (!settings.patternCategories || typeof settings.patternCategories !== 'object') {
      errors.push('Pattern categories must be an object');
    } else {
      // Validate pressure category
      const pressure = settings.patternCategories.pressure;
      if (pressure) {
        if (!Array.isArray(pressure.patterns)) {
          errors.push('Pressure patterns must be an array');
        }
        if (pressure.negativePatterns && !Array.isArray(pressure.negativePatterns)) {
          errors.push('Pressure negative patterns must be an array');
        }
        if (pressure.threshold !== null && (typeof pressure.threshold !== 'number' || pressure.threshold < 0)) {
          errors.push('Pressure threshold must be a non-negative number or null');
        }
      }

      // Validate battery category
      const battery = settings.patternCategories.battery;
      if (battery) {
        if (!Array.isArray(battery.patterns)) {
          errors.push('Battery patterns must be an array');
        }
        if (battery.threshold !== null && (typeof battery.threshold !== 'number' || battery.threshold < 0)) {
          errors.push('Battery threshold must be a non-negative number or null');
        }
      }
    }

    // Validate webhooks
    if (settings.webhooks) {
      if (typeof settings.webhooks.enabled !== 'boolean') {
        errors.push('Webhooks enabled must be a boolean');
      }
      if (settings.webhooks.slackWebhookUrl && typeof settings.webhooks.slackWebhookUrl !== 'string') {
        errors.push('Slack webhook URL must be a string');
      }
      if (settings.webhooks.interval && (typeof settings.webhooks.interval !== 'number' || settings.webhooks.interval < 0)) {
        errors.push('Webhook interval must be a non-negative number');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  } catch (error) {
    return {
      valid: false,
      errors: [`Validation error: ${error.message}`]
    };
  }
}

// Merge settings with defaults
export function mergeWithDefaults(settings) {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    patternCategories: {
      ...DEFAULT_SETTINGS.patternCategories,
      ...(settings.patternCategories || {}),
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
} 