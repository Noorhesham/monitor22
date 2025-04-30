import { API_CONFIG, getAuthHeaders } from '../config';

/**
 * API utility functions
 */

/**
 * Fetch data from an API endpoint
 * @param {string} endpoint - The API endpoint to fetch from
 * @param {Object} options - Additional fetch options
 * @returns {Promise<any>} - The response data
 */
export async function fetchApi(endpoint, options = {}) {
  const url = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...getAuthHeaders(),
        ...(options.headers || {})
      }
    });
    
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error fetching from ${url}:`, error);
    throw error;
  }
}

/**
 * Post data to an API endpoint
 * @param {string} endpoint - The API endpoint to post to
 * @param {Object} data - The data to post
 * @param {Object} options - Additional fetch options
 * @returns {Promise<any>} - The response data
 */
export async function postApi(endpoint, data, options = {}) {
  return fetchApi(endpoint, {
    method: 'POST',
    body: JSON.stringify(data),
    headers: {
      'Content-Type': 'application/json'
    },
    ...options
  });
}

/**
 * Get data from an API endpoint
 * @param {string} endpoint - The API endpoint to get from
 * @param {Object} options - Additional fetch options
 * @returns {Promise<any>} - The response data
 */
export async function getApi(endpoint, options = {}) {
  return fetchApi(endpoint, {
    method: 'GET',
    ...options
  });
} 