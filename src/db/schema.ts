import {
  pgTable,
  text,
  uuid,
  integer,
  timestamp,
  jsonb,
  numeric,
  index,
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
 * x402 payment ledger — every verified on-chain payment recorded here.
 * Used for revenue tracking, auditing, and the admin dashboard.
 */
export const paymentLedger = pgTable(
  "payment_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    txHash: text("tx_hash").notNull().unique(),   // on-chain tx hash (dedup key)
    nonce: text("nonce").notNull(),                // challenge nonce
    paidBy: text("paid_by").notNull(),             // ETH address of payer
    toolName: text("tool_name").notNull(),         // which tool was called
    amountEth: numeric("amount_eth", { precision: 20, scale: 10 }).notNull(),
    endpoint: text("endpoint").notNull(),          // 'a2a' | 'mcp'
    tokenIssued: text("token_issued"),             // bearer token (first 32 chars, for audit)
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("payment_ledger_paid_by_idx").on(t.paidBy),
    index("payment_ledger_tool_name_idx").on(t.toolName),
    index("payment_ledger_created_at_idx").on(t.createdAt),
  ],
);

/**
 * Tool call log — every tool execution recorded for analytics.
 * Covers both chat (free) and A2A/MCP (paid) calls.
 */
export const toolCallLog = pgTable(
  "tool_call_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    toolName: text("tool_name").notNull(),
    source: text("source").notNull(),             // 'chat' | 'a2a' | 'mcp'
    fid: integer("fid"),                          // Farcaster FID if chat, null for A2A/MCP
    callerAddress: text("caller_address"),        // ETH address if A2A/MCP
    success: text("success").notNull().default("true"), // 'true' | 'false'
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("tool_call_log_tool_name_idx").on(t.toolName),
    index("tool_call_log_created_at_idx").on(t.createdAt),
  ],
);
