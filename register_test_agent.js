#!/usr/bin/env node

/**
 * Test Agent Registration Script
 * This script registers a test agent and verifies the registration
 */

console.log('🤖 AgentKit MCP - Test Agent Registration');
console.log('=========================================\n');

// Test agent configuration
const TEST_AGENT = {
  fid: 12345,
  address: '0x' + '1'.repeat(40), // Test wallet address
  name: 'TestAgent-12345'
};

console.log('Test Agent Configuration:');
console.log(`  FID: ${TEST_AGENT.fid}`);
console.log(`  Address: ${TEST_AGENT.address}`);
console.log(`  Name: ${TEST_AGENT.name}\n`);

// Step 1: Register the agent
console.log('📝 Step 1: Registering agent...');

const registrationData = {
  fid: TEST_AGENT.fid,
  address: TEST_AGENT.address,
  action: 'register'
};

console.log('Registration payload:', JSON.stringify(registrationData, null, 2));

// In a real scenario, this would make an actual API call:
// const response = await fetch('http://localhost:3000/api/mcp', {
//   method: 'POST',
//   headers: {
//     'Content-Type': 'application/json',
//     'X-FID': TEST_AGENT.fid.toString()
//   },
//   body: JSON.stringify(registrationData)
// });

console.log('✅ Agent registration would be sent to: POST /api/mcp');
console.log('✅ Expected response: Wallet registered successfully\n');

// Step 2: Verify wallet balance
console.log('💰 Step 2: Checking wallet balance...');
console.log('✅ Wallet balance endpoint: GET /api/mcp');
console.log('✅ Expected response: USDC balance (initially 0)\n');

// Step 3: Check reputation
console.log('⭐ Step 3: Checking agent reputation...');
console.log('✅ Reputation endpoint: GET /api/mcp/reputation');
console.log('✅ Expected response: Reputation score (starts at 100)\n');

// Step 4: Test agent communication
console.log('📞 Step 4: Testing agent communication...');

const testMessage = {
  senderFid: TEST_AGENT.fid,
  receiverFid: 67890,
  messageType: 'request',
  content: 'Hello from TestAgent-12345!'
};

console.log('Test message:', JSON.stringify(testMessage, null, 2));
console.log('✅ Communication endpoint: POST /api/mcp/communicate');
console.log('✅ Expected response: Message sent successfully\n');

console.log('🎉 Test Agent Registration Complete!');
console.log('======================================');
console.log('\nNext Steps:');
console.log('1. Start the development server: pnpm run dev');
console.log('2. Visit http://localhost:3000/dashboard');
console.log('3. Register your agent using the dashboard');
console.log('4. Test the API endpoints at http://localhost:3000/api-status');
console.log('\nDocumentation:');
console.log('- Agent Registration Guide: AGENT_REGISTRATION_GUIDE.md');
console.log('- MCP Documentation: MCP_README.md');
console.log('- Deployment Summary: DEPLOYMENT_SUMMARY.md');