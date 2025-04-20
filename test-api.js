import { API_BASE, getApiHeaders } from './components/Dashboard/constants.js';

async function makeRequest(endpoint, headers) {
    console.log(`\nMaking request to: ${endpoint}`);
    const response = await fetch(`${API_BASE}${endpoint}`, {
        headers,
        method: 'GET'
    });
    
    console.log('Request URL:', `${API_BASE}${endpoint}`);
    console.log('Request headers:', headers);
    console.log('Response status:', response.status);
    
    if (!response.ok) {
        const errorText = await response.text();
        console.error('Error response:', errorText);
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return response.json();
}

async function testApi() {
    try {
        const headers = getApiHeaders();
        console.log('Starting API Tests with headers:', headers);

        // Test specific datum endpoint from logs
        console.log('\n📡 Testing Datum Endpoint');
        const datumData = await makeRequest('/stages/datum/77368775', headers);
        
        if (datumData && datumData.data) {
            console.log('✅ Success! Got datum data:');
            console.log('  Stage ID:', datumData.data.stageId);
            console.log('  Header Name:', datumData.data.name);
            // Get the last non-null value
            const values = datumData.data.data.filter(v => v !== null);
            const lastValue = values[values.length - 1];
            console.log('  Latest Value:', lastValue);
            console.log('  Total Data Points:', datumData.data.data.length);
            console.log('  Start Timestamp:', new Date(datumData.data.startTimestamp).toISOString());
            console.log('  End Timestamp:', new Date(datumData.data.endTimestamp).toISOString());
        } else {
            console.log('⚠️ No datum data found');
        }

        console.log('\n🎉 API test completed successfully!');
        
    } catch (error) {
        console.error('\n❌ Error during API test:', error.message);
        process.exit(1);
    }
}

// Run the test
console.log('🚀 Starting API Test...');
testApi(); 