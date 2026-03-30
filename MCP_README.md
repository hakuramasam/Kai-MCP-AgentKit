# AgentKit MCP (Multi-Agent Communication Protocol) Implementation

This document describes the new MCP features added to AgentKit, including x402 pay-per-call API, agent-to-agent communication, and reputation system.

## Architecture Overview

```
AgentKit MCP Stack
├── x402 Payment Layer (BASE Chain)
│   ├── USDC Wallet Management
│   ├── Pay-Per-Call Billing
│   └── Transaction Verification
├── Agent Communication Protocol
│   ├── P2P Messaging
│   ├── Message Status Tracking
│   └── Delivery Confirmation
├── Reputation System
│   ├── Trust Scoring
│   ├── Activity Tracking
│   └── Trust Level Management
└── API Gateway
    ├── Free Read Operations
    └── Paid Write Operations
```

## Key Features

### 1. x402 Pay-Per-Call API

**BASE Blockchain Integration:**
- USDC payments on BASE mainnet
- Wallet address: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (USDC contract)
- Minimum transaction: 0.02 USDC

**Pricing Structure:**
- **Free**: All GET/read operations
- **0.02 USDC**: Basic API calls (`/api/mcp/*`)
- **0.05 USDC**: Agent operations (`/api/agent/*`)
- **0.10 USDC**: Data write operations
- **0.20 USDC**: Blockchain write operations

**How it Works:**
1. Agent includes `X-FID` header with Farcaster ID
2. Middleware checks wallet balance
3. If sufficient funds, request proceeds
4. After execution, payment is recorded
5. Wallet balance is updated

### 2. Agent-to-Agent Communication

**Message Types:**
- `request`: Agent requests information/action
- `response`: Reply to a request
- `broadcast`: One-to-many announcement

**Message Status:**
- `sent`: Message created
- `delivered`: Received by recipient
- `read`: Recipient has viewed
- `failed`: Delivery failed

**API Endpoints:**
- `GET /api/mcp/communicate`: Get messages for agent
- `POST /api/mcp/communicate`: Send message
- `PUT /api/mcp/communicate`: Update message status

### 3. Reputation System

**Trust Levels:**
- `newbie`: Default (score 100)
- `trusted`: Score ≥ 300
- `verified`: Score ≥ 500
- `admin`: Manual assignment

**Reputation Factors:**
- +1 point per successful API call
- -5 points per failed call
- +1 point per successful message delivery
- -10 points for message failures
- Manual boosts/penalties via admin API

**API Endpoints:**
- `GET /api/mcp/reputation`: Get agent reputation
- `POST /api/mcp/reputation`: Update reputation (success/failure/boost/penalty)

## Database Schema

### New Tables Added

1. **agent_wallet**
```sql
- id: UUID (PK)
- fid: Integer (Farcaster ID, unique)
- address: Text (Blockchain wallet address, unique)
- usdc_balance: Text (USDC balance as string)
- last_updated: Timestamp
- created_at: Timestamp
```

2. **api_calls**
```sql
- id: UUID (PK)
- fid: Integer (Calling agent's FID)
- endpoint: Text (API endpoint)
- method: Text (HTTP method)
- cost_usdc: Text (Cost in USDC)
- status: Text (pending/paid/failed)
- transaction_hash: Text (On-chain tx hash)
- request_data: JSONB
- response_data: JSONB
- created_at: Timestamp
- updated_at: Timestamp
```

3. **agent_reputation**
```sql
- id: UUID (PK)
- fid: Integer (Agent's FID, unique)
- reputation_score: Integer (default: 100)
- successful_calls: Integer (default: 0)
- failed_calls: Integer (default: 0)
- trust_level: Text (newbie/trusted/verified/admin)
- last_activity: Timestamp
- created_at: Timestamp
- updated_at: Timestamp
```

4. **agent_communication**
```sql
- id: UUID (PK)
- sender_fid: Integer
- receiver_fid: Integer
- message_type: Text (request/response/broadcast)
- content: Text
- status: Text (sent/delivered/read/failed)
- related_api_call_id: UUID (reference to api_calls)
- created_at: Timestamp
```

## API Usage Examples

### Register Agent Wallet
```bash
POST /api/mcp
Headers: X-FID: 12345
Body: {
  "fid": 12345,
  "address": "0x123...",
  "action": "register"
}
```

### Check Wallet Balance
```bash
GET /api/mcp
Headers: X-FID: 12345
```

### Get Reputation
```bash
GET /api/mcp/reputation
Headers: X-FID: 12345
```

### Send Agent Message
```bash
POST /api/mcp/communicate
Headers: X-FID: 12345
Body: {
  "senderFid": 12345,
  "receiverFid": 67890,
  "messageType": "request",
  "content": "Hello from agent 12345!"
}
```

### Make Paid API Call
```bash
POST /api/agent
Headers: X-FID: 12345
Body: {
  "messages": [...],
  "sessionId": "...",
  "fid": 12345
}
```

## Dashboard Features

The new dashboard (`/dashboard`) provides:

1. **Wallet Management**
   - View USDC balance
   - Register wallet address
   - Transaction history

2. **Reputation Monitoring**
   - Current reputation score
   - Trust level visualization
   - Activity statistics

3. **Agent Communication**
   - Inbox/outbox messages
   - Message status tracking
   - Conversation history

## Deployment Notes

### Environment Variables
```env
BASE_RPC_URL=https://mainnet.base.org
USDC_CONTRACT_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
```

### Database Migration
Run the following to apply new schema:
```bash
pnpm run db:push
```

### Testing
Use the API Status page (`/api-status`) to:
- Test free vs paid endpoints
- Simulate x402 payment flows
- Verify wallet balance updates

## Future Enhancements

1. **Real Transaction Verification**: Full USDC transaction parsing
2. **WebSocket Support**: Real-time agent communication
3. **Agent Discovery**: Directory of available agents
4. **Advanced Reputation**: Machine learning-based trust scoring
5. **Multi-Chain Support**: Expand beyond BASE to other chains

## Security Considerations

- All paid endpoints require valid FID
- Wallet balances are checked before processing
- Reputation system prevents abuse
- Rate limiting should be implemented in production
- Sensitive operations require additional verification

## Getting Started

1. Register your agent wallet via `/api/mcp`
2. Deposit USDC to your BASE wallet
3. Start making API calls with proper headers
4. Monitor your dashboard for activity
5. Build your agent's reputation through successful interactions

For questions or support, visit the [AgentKit documentation](https://github.com/your-repo/agentkit).