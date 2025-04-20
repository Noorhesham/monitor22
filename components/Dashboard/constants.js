import { API_CONFIG } from '../../config.js';

// Re-export the needed values from the central config
export const API_BASE = API_CONFIG.MASTER_API_BASE;
export const VALID_TOKEN = API_CONFIG.TOKEN;

/**
 * Get the default headers for API requests
 * @returns {Object} Headers object with authorization token
 */
export function getApiHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${VALID_TOKEN}`,
  };
} 