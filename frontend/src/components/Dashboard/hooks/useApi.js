import { useState, useCallback } from 'react';

const API_BASE = process.env.VITE_BACKEND_URL || 'http://localhost:3002';

// Flag to use mock data instead of making real API calls
const USE_MOCK_DATA = false;

// Debug mode to help troubleshoot issues
const DEBUG_MODE = true;

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

  const request = useCallback(async (endpoint, options = {}) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      });

      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const get = useCallback((endpoint) => {
    return request(endpoint, { method: 'GET' });
  }, [request]);

  const post = useCallback((endpoint, data) => {
    return request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }, [request]);

  /**
   * Convenience method for PUT requests.
   * @param {string} endpoint - The API endpoint.
   * @param {Object} data - The request body data.
   * @returns {Promise<any>} API response.
   */
  const put = useCallback((endpoint, data) => {
    return request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }, [request]);

  /**
   * Convenience method for DELETE requests.
   * @param {string} endpoint - The API endpoint.
   * @returns {Promise<any>} API response.
   */
  const del = useCallback((endpoint) => {
    return request(endpoint, { method: 'DELETE' });
  }, [request]);

  return {
    loading,
    error,
    get,
    post,
    put,
    delete: del,
  };
} 