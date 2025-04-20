import fetch from 'node-fetch';
import { API_CONFIG, getAuthHeaders, getApiUrl } from './config.js';

/**
 * Make an API request to a specific base URL and endpoint
 */
async function testEndpoint(baseUrl, endpoint) {
  const url = getApiUrl(baseUrl, endpoint);
  console.log(`Testing ${url}...`);
  
  try {
    const response = await fetch(url, { 
      method: 'GET',
      headers: getAuthHeaders()
    });
    
    console.log(`Response status: ${response.status}`);
    
    if (!response.ok) {
      let errorText = await response.text();
      console.error('Error response body:', errorText);
      try {
        // Try to parse as JSON for prettier display
        const errorJson = JSON.parse(errorText);
        console.error('Error details:', JSON.stringify(errorJson, null, 2));
      } catch (e) {
        // Text wasn't valid JSON, which is fine
      }
      return { success: false, status: response.status, error: errorText };
    }
    
    if (response.status === 204) {
      console.log('No content returned (204)');
      return { success: true, status: 204, data: null };
    }
    
    const data = await response.json();
    console.log('Response data:', JSON.stringify(data, null, 2).slice(0, 500) + '...');
    return { success: true, status: response.status, data };
    
  } catch (error) {
    console.error(`Request error:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Test the same endpoint against multiple base URLs
 */
async function compareEndpoint(endpoint) {
  console.log('\n===========================================================');
  console.log(`COMPARING ENDPOINT: ${endpoint}`);
  console.log('===========================================================');
  
  // Test against master API
  console.log('\nTESTING AGAINST MASTER API:');
  const masterResult = await testEndpoint(API_CONFIG.MASTER_API_BASE, endpoint);
  
  // Test against local API if available
  console.log('\nTESTING AGAINST LOCAL API:');
  const localResult = await testEndpoint(API_CONFIG.LOCAL_API_BASE, endpoint);
  
  console.log('\nCOMPARISON RESULT:');
  console.log(`Master API: ${masterResult.success ? 'SUCCESS' : 'FAILED'} (Status: ${masterResult.status || 'N/A'})`);
  console.log(`Local API: ${localResult.success ? 'SUCCESS' : 'FAILED'} (Status: ${localResult.status || 'N/A'})`);
  
  return {
    endpoint,
    master: masterResult,
    local: localResult
  };
}

/**
 * Main function to run all tests
 */
async function runTests() {
  console.log('STARTING API ENDPOINT COMPARISON TESTS');
  console.log('======================================');
  
  const results = [];
  
  // Test all endpoints defined in our config
  for (const [name, endpoint] of Object.entries(API_CONFIG.TEST_ENDPOINTS)) {
    console.log(`\nTesting endpoint: ${name}`);
    const result = await compareEndpoint(endpoint);
    results.push(result);
  }
  
  console.log('\n\nSUMMARY OF RESULTS:');
  console.log('===================');
  
  results.forEach(result => {
    console.log(`\nEndpoint: ${result.endpoint}`);
    console.log(`  Master API: ${result.master.success ? 'SUCCESS' : 'FAILED'} (${result.master.status || 'Error'})`);
    console.log(`  Local API: ${result.local.success ? 'SUCCESS' : 'FAILED'} (${result.local.status || 'Error'})`);
  });
}

// Execute the tests
runTests().catch(error => {
  console.error('Test script error:', error);
}); 