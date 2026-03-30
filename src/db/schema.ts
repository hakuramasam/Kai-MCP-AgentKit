import {
  pgTable,
  text,
  uuid,
  integer,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

/**
 * Key-Value Store Table
 *
 * Built-in table for simple key-value storage.
 * Available immediately without schema changes.
 *
 * ⚠️ CRITICAL: DO NOT DELETE OR EDIT THIS TABLE DEFINITION ⚠️
 * This table is required for the app to function properly.
 * DO NOT delete, modify, rename, or change any part of this table.
 * Removing or editing it will cause database schema conflicts and prevent
 * the app from starting.
 *
 * Use for:
 * - User preferences/settings
 * - App configuration
 * - Simple counters
 * - Temporary data
 */
export const kv = pgTable("kv", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/**
 * Chat sessions — one per user conversation thread
 */
export const chatSessions = pgTable("chat_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  fid: integer("fid").notNull(),
  title: text("title").notNull().default("New conversation"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Chat messages — individual messages in a session
 */
export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull(),
  fid: integer("fid").notNull(),
  role: text("role").notNull(), // 'user' | 'assistant' | 'tool'
  content: text("content").notNull(),
  toolCalls: jsonb("tool_calls"), // tool call metadata if role = 'assistant'
  toolName: text("tool_name"), // if role = 'tool'
  tokens: integer("tokens"), // token usage
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Agent memory — semantic memories stored per user
 */
export const agentMemory = pgTable("agent_memory", {
  id: uuid("id").primaryKey().defaultRandom(),
  fid: integer("fid").notNull(),
  content: text("content").notNull(), // the memory text
  category: text("category").notNull().default("general"), // 'preference' | 'fact' | 'context' | 'general'
  importance: integer("importance").notNull().default(5), // 1-10
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Agent Wallet — USDC balances and transaction history for x402 payments
 */
export const agentWallet = pgTable("agent_wallet", {
  id: uuid("id").primaryKey().defaultRandom(),
  fid: integer("fid").notNull().unique(), // Farcaster ID as unique identifier
  address: text("address").notNull().unique(), // Blockchain wallet address
  usdcBalance: text("usdc_balance").notNull().default("0"), // USDC balance as string to avoid floating point issues
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * API Calls — Track x402 API usage and payments
 */
export const apiCalls = pgTable("api_calls", {
  id: uuid("id").primaryKey().defaultRandom(),
  fid: integer("fid").notNull(), // Calling agent's Farcaster ID
  endpoint: text("endpoint").notNull(), // API endpoint called
  method: text("method").notNull(), // HTTP method
  costUsdc: text("cost_usdc").notNull(), // Cost in USDC (as string)
  status: text("status").notNull(), // 'pending' | 'paid' | 'failed'
  transactionHash: text("transaction_hash"), // On-chain transaction hash
  requestData: jsonb("request_data"), // Request payload
  responseData: jsonb("response_data"), // Response payload
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Agent Reputation — Trust scores for agent-to-agent interactions
 */
export const agentReputation = pgTable("agent_reputation", {
  id: uuid("id").primaryKey().defaultRandom(),
  fid: integer("fid").notNull().unique(), // Agent's Farcaster ID
  reputationScore: integer("reputation_score").notNull().default(100), // Base score 100
  successfulCalls: integer("successful_calls").notNull().default(0),
  failedCalls: integer("failed_calls").notNull().default(0),
  trustLevel: text("trust_level").notNull().default("newbie"), // 'newbie' | 'trusted' | 'verified' | 'admin'
  lastActivity: timestamp("last_activity"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Agent Communication — Messages between agents
 */
export const agentCommunication = pgTable("agent_communication", {
  id: uuid("id").primaryKey().defaultRandom(),
  senderFid: integer("sender_fid").notNull(),
  receiverFid: integer("receiver_fid").notNull(),
  messageType: text("message_type").notNull(), // 'request' | 'response' | 'broadcast'
  content: text("content").notNull(),
  status: text("status").notNull().default("sent"), // 'sent' | 'delivered' | 'read' | 'failed'
  relatedApiCallId: uuid("related_api_call_id"), // Reference to api_calls table if related
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
