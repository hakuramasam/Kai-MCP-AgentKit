"use server";

import { db } from "@/neynar-db-sdk/db";
import { paymentLedger, toolCallLog } from "@/db/schema";
import { desc, sql, eq, count, sum } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";

export type PaymentRecord = InferSelectModel<typeof paymentLedger>;
export type ToolCallRecord = InferSelectModel<typeof toolCallLog>;

// ─── Write ────────────────────────────────────────────────────────────────────

export async function recordPayment(params: {
  txHash: string;
  nonce: string;
  paidBy: string;
  toolName: string;
  amountEth: string;
  endpoint: "a2a" | "mcp";
  tokenIssued?: string;
}): Promise<void> {
  try {
    await db
      .insert(paymentLedger)
      .values({
        txHash: params.txHash.toLowerCase(),
        nonce: params.nonce,
        paidBy: params.paidBy.toLowerCase(),
        toolName: params.toolName,
        amountEth: params.amountEth,
        endpoint: params.endpoint,
        tokenIssued: params.tokenIssued ? params.tokenIssued.slice(0, 32) : null,
      })
      .onConflictDoNothing(); // idempotent — same txHash never double-counted
  } catch {
    // Non-fatal — don't break tool execution if ledger write fails
  }
}

export async function recordToolCall(params: {
  toolName: string;
  source: "chat" | "a2a" | "mcp";
  fid?: number;
  callerAddress?: string;
  success: boolean;
  durationMs?: number;
}): Promise<void> {
  try {
    await db.insert(toolCallLog).values({
      toolName: params.toolName,
      source: params.source,
      fid: params.fid ?? null,
      callerAddress: params.callerAddress?.toLowerCase() ?? null,
      success: params.success ? "true" : "false",
      durationMs: params.durationMs ?? null,
    });
  } catch {
    // Non-fatal
  }
}

// ─── Read: payment ledger ─────────────────────────────────────────────────────

export async function getRecentPayments(limit = 20): Promise<PaymentRecord[]> {
  return db
    .select()
    .from(paymentLedger)
    .orderBy(desc(paymentLedger.createdAt))
    .limit(limit);
}

export async function getTotalRevenue(): Promise<{
  totalEth: string;
  totalPayments: number;
  uniquePayers: number;
}> {
  const [totals] = await db
    .select({
      totalEth: sql<string>`COALESCE(SUM(${paymentLedger.amountEth}), 0)::text`,
      totalPayments: count(),
      uniquePayers: sql<number>`COUNT(DISTINCT ${paymentLedger.paidBy})`,
    })
    .from(paymentLedger);

  return {
    totalEth: totals?.totalEth ?? "0",
    totalPayments: totals?.totalPayments ?? 0,
    uniquePayers: Number(totals?.uniquePayers ?? 0),
  };
}

export async function getRevenueByTool(): Promise<
  Array<{ toolName: string; totalEth: string; callCount: number }>
> {
  return db
    .select({
      toolName: paymentLedger.toolName,
      totalEth: sql<string>`COALESCE(SUM(${paymentLedger.amountEth}), 0)::text`,
      callCount: count(),
    })
    .from(paymentLedger)
    .groupBy(paymentLedger.toolName)
    .orderBy(desc(sql`SUM(${paymentLedger.amountEth})`))
    .limit(20);
}

export async function getTopCallers(): Promise<
  Array<{ paidBy: string; totalEth: string; callCount: number }>
> {
  return db
    .select({
      paidBy: paymentLedger.paidBy,
      totalEth: sql<string>`COALESCE(SUM(${paymentLedger.amountEth}), 0)::text`,
      callCount: count(),
    })
    .from(paymentLedger)
    .groupBy(paymentLedger.paidBy)
    .orderBy(desc(sql`SUM(${paymentLedger.amountEth})`))
    .limit(10);
}

// ─── Read: tool call analytics ────────────────────────────────────────────────

export async function getToolCallStats(): Promise<
  Array<{ toolName: string; totalCalls: number; successRate: string; sources: string }>
> {
  const rows = await db
    .select({
      toolName: toolCallLog.toolName,
      totalCalls: count(),
      successCount: sql<number>`SUM(CASE WHEN ${toolCallLog.success} = 'true' THEN 1 ELSE 0 END)`,
      chatCalls: sql<number>`SUM(CASE WHEN ${toolCallLog.source} = 'chat' THEN 1 ELSE 0 END)`,
      a2aCalls: sql<number>`SUM(CASE WHEN ${toolCallLog.source} = 'a2a' THEN 1 ELSE 0 END)`,
      mcpCalls: sql<number>`SUM(CASE WHEN ${toolCallLog.source} = 'mcp' THEN 1 ELSE 0 END)`,
    })
    .from(toolCallLog)
    .groupBy(toolCallLog.toolName)
    .orderBy(desc(count()));

  return rows.map((r) => ({
    toolName: r.toolName,
    totalCalls: r.totalCalls,
    successRate:
      r.totalCalls > 0
        ? `${Math.round((Number(r.successCount) / r.totalCalls) * 100)}%`
        : "0%",
    sources: [
      r.chatCalls > 0 ? `chat:${r.chatCalls}` : "",
      r.a2aCalls > 0 ? `a2a:${r.a2aCalls}` : "",
      r.mcpCalls > 0 ? `mcp:${r.mcpCalls}` : "",
    ]
      .filter(Boolean)
      .join(" "),
  }));
}

export async function getDailyRevenue(days = 7): Promise<
  Array<{ date: string; totalEth: string; payments: number }>
> {
  const rows = await db
    .select({
      date: sql<string>`DATE(${paymentLedger.createdAt})::text`,
      totalEth: sql<string>`COALESCE(SUM(${paymentLedger.amountEth}), 0)::text`,
      payments: count(),
    })
    .from(paymentLedger)
    .where(sql`${paymentLedger.createdAt} >= NOW() - INTERVAL '${sql.raw(String(days))} days'`)
    .groupBy(sql`DATE(${paymentLedger.createdAt})`)
    .orderBy(sql`DATE(${paymentLedger.createdAt})`);

  return rows;
}
