/**
 * API Configuration
 */

export const API_CONFIG = {
  MASTER_API_BASE: process.env.VITE_MASTER_API_BASE || 'https://master.api.fracbrain.com/api/v1',
  MONITOR_API_PORT: process.env.VITE_MONITOR_API_PORT || 3003,
  FRONTEND_URL: process.env.VITE_FRONTEND_URL || 'http://localhost:3001',
  
  get baseUrl() {
    // Use relative path for API requests - this works with Vite's proxy
    return '/api';
  },
  
  get statusUrl() {
    return `${this.baseUrl}/status`;
  }
};

/**
 * Get authentication headers for API requests
 */
export function getAuthHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
  };
}

// Default export containing all config
export default {
  API_CONFIG,
  getAuthHeaders
};
