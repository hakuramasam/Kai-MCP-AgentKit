#!/usr/bin/env node

/**
 * Simple API endpoint tester for AgentKit MCP features
 * This tests the database actions directly without needing the full Next.js server
 */

const { getOrCreateAgentWallet, getWalletBalance } = require('./src/db/actions/mcp-actions');
const { getOrCreateAgentReputation } = require('./src/db/actions/mcp-actions');
const { sendAgentMessage, getAgentMessages } = require('./src/db/actions/mcp-actions');

async function testMcpFeatures() {
  console.log('🧪 Testing AgentKit MCP Features...\n');

  try {
    // Test 1: Wallet Operations
    console.log('1. Testing Wallet Operations');
    const testFid = 12345;
    const testAddress = '0x' + '1'.repeat(40); // Demo address
    
    const wallet = await getOrCreateAgentWallet(testFid, testAddress);
    console.log('   ✅ Wallet created:', { fid: wallet.fid, address: wallet.address });
    
    const balance = await getWalletBalance(testFid);
    console.log('   ✅ Wallet balance:', balance, 'USDC');

    // Test 2: Reputation System
    console.log('\n2. Testing Reputation System');
    const reputation = await getOrCreateAgentReputation(testFid);
    console.log('   ✅ Reputation created:', {
      fid: reputation.fid,
      score: reputation.reputationScore,
      trustLevel: reputation.trustLevel
    });

    // Test 3: Agent Communication
    console.log('\n3. Testing Agent Communication');
    const message = await sendAgentMessage({
      senderFid: testFid,
      receiverFid: 67890,
      messageType: 'request',
      content: 'Hello from the test script!'
    });
    console.log('   ✅ Message sent:', {
      id: message.id,
      type: message.messageType,
      content: message.content
    });

    const messages = await getAgentMessages(67890);
    console.log('   ✅ Messages retrieved:', messages.length, 'messages');

    console.log('\n🎉 All MCP features working correctly!');
    console.log('\n📋 Summary:');
    console.log('   • x402 Wallet System: ✅ Working');
    console.log('   • Reputation System: ✅ Working');
    console.log('   • Agent Communication: ✅ Working');
    console.log('   • Database Schema: ✅ Applied');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the tests
testMcpFeatures();