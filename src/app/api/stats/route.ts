/**
 * GET /api/stats — public stats endpoint
 * Returns aggregated (non-sensitive) data for A2A discovery and health checks.
 */

import { NextResponse } from "next/server";
import { getTotalRevenue, getToolCallStats } from "@/db/actions/payment-actions";
import { TOOL_DEFINITIONS } from "@/features/agent/lib/tools";
import { TOOL_PRICES } from "@/features/agent/lib/x402";

export const runtime = "nodejs";

export async function GET() {
  try {
    const [revenue, toolStats] = await Promise.all([
      getTotalRevenue(),
      getToolCallStats(),
    ]);

    return NextResponse.json({
      agent: "AgentKit",
      version: "1.0.0",
      status: "operational",
      tools: {
        total: TOOL_DEFINITIONS.length,
        pricing: TOOL_PRICES,
      },
      stats: {
        totalPayments: revenue.totalPayments,
        totalEthReceived: revenue.totalEth,
        uniquePayers: revenue.uniquePayers,
        topTools: toolStats.slice(0, 5).map((t) => ({
          name: t.toolName,
          calls: t.totalCalls,
        })),
      },
      endpoints: {
        chat: "/api/agent",
        a2a: "/api/a2a",
        mcp: "/api/mcp",
        stats: "/api/stats",
      },
      payment: {
        protocol: "x402",
        network: "base",
        chainId: 8453,
        recipient: process.env.NEYNAR_WALLET_ADDRESS ?? "0xd7e2341c4ca1de1c1f55a9514d8e720a60a9a87e",
      },
      generatedAt: new Date().toISOString(),
    });
  } catch {
    // Return minimal response if DB is unavailable
    return NextResponse.json({
      agent: "AgentKit",
      version: "1.0.0",
      status: "operational",
      generatedAt: new Date().toISOString(),
    });
  }
}
