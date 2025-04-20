import { useState, useCallback } from 'react';
import { API_CONFIG, getAuthHeaders } from '../../../config';

// Flag to use mock data instead of making real API calls
const USE_MOCK_DATA = false;

// Debug mode to help troubleshoot issues
const DEBUG_MODE = false;

// Simplified mock data for local development
const MOCK_DATA = {
  '/stages/active/stages': {
    stages: [
      {
        stageId: 269021,
        projectId: 12345,
        projectName: 'Magnolia Project',
        wellNumber: 'PT LD 38H #1',
        stageName: 'Stage 5',
        companyName: 'Demo Company'
      }
    ]
  },
  '/stages/269021/headers': {
    headers: [
      { id: 1001, name: 'Casing Pressure', stageId: 269021 },
      { id: 1002, name: 'Tubing Pressure', stageId: 269021 }
    ]
  },
  '/project/12345/header/1001/value': { value: 2500.75 },
  '/project/12345/header/1002/value': { value: 1800.25 }
};

/**
 * Custom hook for making authenticated API calls.
 * Encapsulates API base URL, authentication headers, loading, and error states.
 */
export default function useApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Generic fetch function with authentication and error handling.
   * @param {string} endpoint - The API endpoint (e.g., '/stages').
   * @param {object} options - Standard fetch options (method, body, etc.).
   * @returns {Promise<any>} - Resolves with the JSON response or null on error.
   */
  const fetchApi = useCallback(async (endpoint, options = {}) => {
    if (DEBUG_MODE) console.log(`API Request: ${options.method || 'GET'} ${endpoint}`);
    
    setLoading(true);
    setError(null);

    // Return mock data if enabled
    if (USE_MOCK_DATA) {
      return new Promise((resolve) => {
        if (DEBUG_MODE) console.log('Using mock data for endpoint:', endpoint);
        
        // Use simplified timeout to avoid potential issues
        setTimeout(() => {
          setLoading(false);
          
          if (MOCK_DATA[endpoint]) {
            if (DEBUG_MODE) console.log('Mock data found');
            resolve(MOCK_DATA[endpoint]);
          } else {
            if (DEBUG_MODE) console.log('No mock data for endpoint:', endpoint);
            // Return an empty object instead of null for unknown endpoints
            resolve({});
          }
        }, 300);
      });
    }

    try {
      const url = `${API_CONFIG.MASTER_API_BASE}${endpoint}`;
      const apiHeaders = getAuthHeaders();
      
      if (DEBUG_MODE) console.log('Request headers:', apiHeaders);
      
      const response = await fetch(url, {
        ...options,
        headers: {
          ...apiHeaders,
          ...options.headers,
        },
      });

      if (DEBUG_MODE) console.log(`Response status: ${response.status}`);

      if (!response.ok) {
        let errorData = { message: `Request failed with status ${response.status}` };
        try {
          const errorText = await response.text();
          if (DEBUG_MODE) console.error('Error response body:', errorText);
          
          try {
            errorData = JSON.parse(errorText);
          } catch (jsonParseError) {
            // Keep using the default error message
          }
        } catch (parseError) {
          // Ignore if response body is not readable
        }
        throw new Error(errorData.message || `Request failed with status ${response.status}`);
      }

      if (response.status === 204) {
        return null; 
      }

      const data = await response.json();
      if (DEBUG_MODE) console.log('API response received');
      return data;

    } catch (err) {
      console.error(`API Error:`, err.message);
      setError(err.message || 'An unexpected error occurred.');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Convenience method for GET requests.
   * @param {string} endpoint - The API endpoint.
   * @returns {Promise<any>} API response.
   */
  const get = useCallback((endpoint) => {
    return fetchApi(endpoint, { method: 'GET' });
  }, [fetchApi]);

  /**
   * Convenience method for POST requests.
   * @param {string} endpoint - The API endpoint.
   * @param {Object} data - The request body data.
   * @returns {Promise<any>} API response.
   */
  const post = useCallback((endpoint, data) => {
    return fetchApi(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }, [fetchApi]);

  /**
   * Convenience method for PUT requests.
   * @param {string} endpoint - The API endpoint.
   * @param {Object} data - The request body data.
   * @returns {Promise<any>} API response.
   */
  const put = useCallback((endpoint, data) => {
    return fetchApi(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }, [fetchApi]);

  /**
   * Convenience method for DELETE requests.
   * @param {string} endpoint - The API endpoint.
   * @returns {Promise<any>} API response.
   */
  const del = useCallback((endpoint) => {
    return fetchApi(endpoint, { method: 'DELETE' });
  }, [fetchApi]);

  return {
    fetchApi,
    get,
    post,
    put,
    delete: del,
    loading,
    error,
  };
} 