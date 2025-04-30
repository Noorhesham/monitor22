import { API_CONFIG, getAuthHeaders as getConfigAuthHeaders } from '@config';

// Re-export the needed values from the central config
export const API_BASE = API_CONFIG.MASTER_API_BASE;
// TOKEN should come from env vars or secure storage, not hardcoded here
// export const VALID_TOKEN = API_CONFIG.TOKEN;

// Snooze duration options in milliseconds
export const SNOOZE_DURATIONS = [
  { label: '1 hour', value: 3600000 },
  { label: '3 hours', value: 10800000 },
  { label: '6 hours', value: 21600000 },
  { label: '12 hours', value: 43200000 },
  { label: '24 hours', value: 86400000 },
  { label: '36 hours', value: 129600000 },
];

/**
 * Get the default headers for API requests (potentially redundant with config.js version)
 * @returns {Object} Headers object with authorization token
 */
export function getApiHeaders() {
  // It's better to rely on the function from config.js if it handles dynamic tokens
  return getConfigAuthHeaders();
} 