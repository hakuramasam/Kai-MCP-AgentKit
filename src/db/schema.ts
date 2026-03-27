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
