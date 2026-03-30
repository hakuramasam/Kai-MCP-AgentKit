"use server";

import { db } from "@/neynar-db-sdk/db";
import { agentWallet, apiCalls, agentReputation, agentCommunication } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";

export type AgentWallet = InferSelectModel<typeof agentWallet>;
export type ApiCall = InferSelectModel<typeof apiCalls>;
export type AgentReputation = InferSelectModel<typeof agentReputation>;
export type AgentCommunication = InferSelectModel<typeof agentCommunication>;

// ─── Agent Wallet Operations ────────────────────────────────────────────────

export async function getOrCreateAgentWallet(fid: number, address: string): Promise<AgentWallet> {
  const existing = await db
    .select()
    .from(agentWallet)
    .where(eq(agentWallet.fid, fid))
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  const [wallet] = await db
    .insert(agentWallet)
    .values({ fid, address, usdcBalance: "0" })
    .returning();
  return wallet;
}

export async function updateWalletBalance(fid: number, amountUsdc: string): Promise<AgentWallet> {
  const [wallet] = await db
    .update(agentWallet)
    .set({ 
      usdcBalance: db.sql`${agentWallet.usdcBalance} + ${amountUsdc}`,
      lastUpdated: new Date()
    })
    .where(eq(agentWallet.fid, fid))
    .returning();
  return wallet;
}

export async function getWalletBalance(fid: number): Promise<string> {
  const result = await db
    .select({ balance: agentWallet.usdcBalance })
    .from(agentWallet)
    .where(eq(agentWallet.fid, fid))
    .limit(1);
  
  return result.length > 0 ? result[0].balance : "0";
}

// ─── API Call Tracking ────────────────────────────────────────────────────

export async function logApiCall(params: {
  fid: number;
  endpoint: string;
  method: string;
  costUsdc: string;
  requestData?: unknown;
}): Promise<ApiCall> {
  const [call] = await db
    .insert(apiCalls)
    .values({
      fid: params.fid,
      endpoint: params.endpoint,
      method: params.method,
      costUsdc: params.costUsdc,
      status: "pending",
      requestData: params.requestData,
    })
    .returning();
  return call;
}

export async function markApiCallPaid(callId: string, transactionHash: string): Promise<ApiCall> {
  const [call] = await db
    .update(apiCalls)
    .set({ 
      status: "paid",
      transactionHash,
      updatedAt: new Date()
    })
    .where(eq(apiCalls.id, callId))
    .returning();
  return call;
}

export async function markApiCallFailed(callId: string, error: string): Promise<ApiCall> {
  const [call] = await db
    .update(apiCalls)
    .set({ 
      status: "failed",
      responseData: { error },
      updatedAt: new Date()
    })
    .where(eq(apiCalls.id, callId))
    .returning();
  return call;
}

export async function getPendingApiCalls(fid: number): Promise<ApiCall[]> {
  return db
    .select()
    .from(apiCalls)
    .where(and(
      eq(apiCalls.fid, fid),
      eq(apiCalls.status, "pending")
    ))
    .orderBy(desc(apiCalls.createdAt));
}

// ─── Agent Reputation ────────────────────────────────────────────────────

export async function getOrCreateAgentReputation(fid: number): Promise<AgentReputation> {
  const existing = await db
    .select()
    .from(agentReputation)
    .where(eq(agentReputation.fid, fid))
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  const [reputation] = await db
    .insert(agentReputation)
    .values({ fid })
    .returning();
  return reputation;
}

export async function updateReputationScore(fid: number, scoreChange: number): Promise<AgentReputation> {
  const [reputation] = await db
    .update(agentReputation)
    .set({ 
      reputationScore: db.sql`${agentReputation.reputationScore} + ${scoreChange}`,
      updatedAt: new Date()
    })
    .where(eq(agentReputation.fid, fid))
    .returning();
  return reputation;
}

export async function recordSuccessfulCall(fid: number): Promise<AgentReputation> {
  const [reputation] = await db
    .update(agentReputation)
    .set({ 
      successfulCalls: db.sql`${agentReputation.successfulCalls} + 1`,
      updatedAt: new Date(),
      lastActivity: new Date()
    })
    .where(eq(agentReputation.fid, fid))
    .returning();
  return reputation;
}

export async function recordFailedCall(fid: number): Promise<AgentReputation> {
  const [reputation] = await db
    .update(agentReputation)
    .set({ 
      failedCalls: db.sql`${agentReputation.failedCalls} + 1`,
      updatedAt: new Date(),
      lastActivity: new Date()
    })
    .where(eq(agentReputation.fid, fid))
    .returning();
  return reputation;
}

// ─── Agent Communication ─────────────────────────────────────────────────

export async function sendAgentMessage(params: {
  senderFid: number;
  receiverFid: number;
  messageType: string;
  content: string;
  relatedApiCallId?: string;
}): Promise<AgentCommunication> {
  const [message] = await db
    .insert(agentCommunication)
    .values(params)
    .returning();
  return message;
}

export async function getAgentMessages(fid: number, limit = 20): Promise<AgentCommunication[]> {
  return db
    .select()
    .from(agentCommunication)
    .where(and(
      eq(agentCommunication.receiverFid, fid)
    ))
    .orderBy(desc(agentCommunication.createdAt))
    .limit(limit);
}

export async function markMessageDelivered(messageId: string): Promise<AgentCommunication> {
  const [message] = await db
    .update(agentCommunication)
    .set({ status: "delivered" })
    .where(eq(agentCommunication.id, messageId))
    .returning();
  return message;
}

export async function markMessageRead(messageId: string): Promise<AgentCommunication> {
  const [message] = await db
    .update(agentCommunication)
    .set({ status: "read" })
    .where(eq(agentCommunication.id, messageId))
    .returning();
  return message;
}