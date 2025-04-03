// Test script for API endpoints
const baseUrl = 'http://localhost:5002';

async function testEndpoints() {
  console.log('Testing API endpoints...');
  
  // Test health endpoint
  try {
    console.log('Testing /api/health...');
    const healthResponse = await fetch(`${baseUrl}/api/health`);
    const healthData = await healthResponse.json();
    console.log('Health response:', healthData);
  } catch (error) {
    console.error('Health endpoint failed:', error);
  }
  
  // Test test endpoint
  try {
    console.log('Testing /api/test...');
    const testResponse = await fetch(`${baseUrl}/api/test`);
    const testData = await testResponse.json();
    console.log('Test response:', testData);
  } catch (error) {
    console.error('Test endpoint failed:', error);
  }
  
  // Test gpt endpoint with a POST request
  try {
    console.log('Testing /api/gpt...');
    const gptResponse = await fetch(`${baseUrl}/api/gpt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: 'What does it mean to live virtuously according to the Stoics?',
        mentor: 'Marcus',
      }),
    });
    const gptData = await gptResponse.json();
    console.log('GPT response:', gptData);
  } catch (error) {
    console.error('GPT endpoint failed:', error);
  }
}

// Run the tests
testEndpoints(); 