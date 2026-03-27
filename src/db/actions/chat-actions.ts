"use server";

import { db } from "@/neynar-db-sdk/db";
import { chatSessions, chatMessages, agentMemory } from "@/db/schema";
import { eq, desc, and, asc } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";

export type ChatSession = InferSelectModel<typeof chatSessions>;
export type ChatMessage = InferSelectModel<typeof chatMessages>;
export type AgentMemory = InferSelectModel<typeof agentMemory>;

// ─── Sessions ───────────────────────────────────────────────────────────────

export async function createSession(fid: number, title?: string): Promise<ChatSession> {
  const [session] = await db
    .insert(chatSessions)
    .values({ fid, title: title ?? "New conversation" })
    .returning();
  return session;
}

export async function getUserSessions(fid: number): Promise<ChatSession[]> {
  return db
    .select()
    .from(chatSessions)
    .where(eq(chatSessions.fid, fid))
    .orderBy(desc(chatSessions.updatedAt))
    .limit(20);
}

export async function updateSessionTitle(id: string, title: string): Promise<void> {
  await db
    .update(chatSessions)
    .set({ title, updatedAt: new Date() })
    .where(eq(chatSessions.id, id));
}

export async function deleteSession(id: string): Promise<void> {
  await db.delete(chatMessages).where(eq(chatMessages.sessionId, id));
  await db.delete(chatSessions).where(eq(chatSessions.id, id));
}

export async function touchSession(id: string): Promise<void> {
  await db
    .update(chatSessions)
    .set({ updatedAt: new Date() })
    .where(eq(chatSessions.id, id));
}

// ─── Messages ────────────────────────────────────────────────────────────────

export async function saveMessage(params: {
  sessionId: string;
  fid: number;
  role: string;
  content: string;
  toolCalls?: unknown;
  toolName?: string;
  tokens?: number;
}): Promise<ChatMessage> {
  const [msg] = await db.insert(chatMessages).values(params).returning();
  return msg;
}

export async function getSessionMessages(sessionId: string): Promise<ChatMessage[]> {
  return db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(asc(chatMessages.createdAt));
}

export async function clearSessionMessages(sessionId: string): Promise<void> {
  await db.delete(chatMessages).where(eq(chatMessages.sessionId, sessionId));
}

// ─── Memory ──────────────────────────────────────────────────────────────────

export async function saveMemory(params: {
  fid: number;
  content: string;
  category?: string;
  importance?: number;
}): Promise<AgentMemory> {
  const [mem] = await db
    .insert(agentMemory)
    .values({
      fid: params.fid,
      content: params.content,
      category: params.category ?? "general",
      importance: params.importance ?? 5,
    })
    .returning();
  return mem;
}

export async function getMemories(fid: number, limit = 20): Promise<AgentMemory[]> {
  return db
    .select()
    .from(agentMemory)
    .where(eq(agentMemory.fid, fid))
    .orderBy(desc(agentMemory.importance), desc(agentMemory.createdAt))
    .limit(limit);
}

export async function deleteMemory(id: string): Promise<void> {
  await db.delete(agentMemory).where(eq(agentMemory.id, id));
}

export async function getMemoriesByCategory(
  fid: number,
  category: string,
): Promise<AgentMemory[]> {
  return db
    .select()
    .from(agentMemory)
    .where(and(eq(agentMemory.fid, fid), eq(agentMemory.category, category)))
    .orderBy(desc(agentMemory.importance))
    .limit(10);
}
