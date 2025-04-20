import fetch from 'node-fetch';
import { API_CONFIG, getAuthHeaders } from './config.js';

async function getActiveStages() {
  const url = `${API_CONFIG.MASTER_API_BASE}/stages/active/stages`;
  console.log(`\nFetching active stages from: ${url}`);
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: getAuthHeaders()
    });
    
    console.log(`Response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error response:', errorText);
      return null;
    }
    
    const data = await response.json();
    console.log('Found active stages:', data.stages.length);
    return data.stages;
    
  } catch (error) {
    console.error('Request failed:', error.message);
    return null;
  }
}

async function getStageHeaders(stageId) {
  const url = `${API_CONFIG.MASTER_API_BASE}/stages/${stageId}/headers`;
  console.log(`\nFetching headers for stage ${stageId} from: ${url}`);
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: getAuthHeaders()
    });
    
    console.log(`Response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error response:', errorText);
      return null;
    }
    
    const data = await response.json();
    console.log('Found headers:', data.headers.length);
    return data.headers;
    
  } catch (error) {
    console.error('Request failed:', error.message);
    return null;
  }
}

async function testDatumEndpoint(datumId) {
  const url = `${API_CONFIG.MASTER_API_BASE}/stages/datum/${datumId}`;
  console.log(`\nTesting datum endpoint: ${url}`);
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: getAuthHeaders()
    });
    
    console.log(`Response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error response:', errorText);
      return;
    }
    
    const data = await response.json();
    console.log('Response data:', JSON.stringify(data, null, 2));
    
  } catch (error) {
    console.error('Request failed:', error.message);
  }
}

async function testMasterActiveStages() {
  const url = `${API_CONFIG.MASTER_API_BASE}/stages/active/stages`;
  console.log(`\nTesting MASTER active stages endpoint: ${url}`);
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: getAuthHeaders()
    });
    
    console.log(`Response status: ${response.status}`);
    const responseText = await response.text();
    // console.log('Raw response text:', responseText); // Keep this commented unless needed

    try {
        const jsonData = JSON.parse(responseText);
        console.log('Parsed JSON response:', JSON.stringify(jsonData, null, 2));
        console.log('\nSuccessfully fetched active stages from MASTER API.');
    } catch (jsonError) {
        console.error('Response was not valid JSON.');
        console.log('Raw response text was:', responseText);
    }
    
  } catch (error) {
    console.error('Request failed:', error.message);
  }
}

testMasterActiveStages(); 