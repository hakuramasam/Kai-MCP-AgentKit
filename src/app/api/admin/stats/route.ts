/**
 * GET /api/admin/stats
 *
 * Returns aggregated payment + tool usage stats.
 * Protected: only the app creator (NEXT_PUBLIC_USER_FID) may call this.
 * Also used by the public /api/stats endpoint (limited data).
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getTotalRevenue,
  getRevenueByTool,
  getTopCallers,
  getToolCallStats,
  getRecentPayments,
  getDailyRevenue,
} from "@/db/actions/payment-actions";
import { getWalletBalance, isWalletConfigured } from "@/features/agent/lib/wallet";

export const runtime = "nodejs";

const CREATOR_FID = parseInt(process.env.NEXT_PUBLIC_USER_FID ?? "0", 10);

export async function GET(req: NextRequest) {
  // Auth check — only the creator FID may access admin stats
  const fidHeader = req.headers.get("x-fid");
  const requestFid = fidHeader ? parseInt(fidHeader, 10) : 0;

  if (!CREATOR_FID || requestFid !== CREATOR_FID) {
    return NextResponse.json(
      { error: "Unauthorized. Admin access requires creator FID." },
      { status: 403 },
    );
  }

  try {
    // Fetch all stats in parallel
    const [revenue, byTool, topCallers, toolStats, recentPayments, dailyRevenue, walletBalance] =
      await Promise.all([
        getTotalRevenue(),
        getRevenueByTool(),
        getTopCallers(),
        getToolCallStats(),
        getRecentPayments(20),
        getDailyRevenue(7),
        isWalletConfigured()
          ? getWalletBalance().catch(() => null)
          : Promise.resolve(null),
      ]);

    return NextResponse.json({
      revenue,
      byTool,
      topCallers,
      toolStats,
      recentPayments,
      dailyRevenue,
      wallet: walletBalance
        ? {
            address: walletBalance.address,
            ethBalance: walletBalance.ethBalance,
            usdcBalance: walletBalance.usdcBalance,
            network: walletBalance.network,
          }
        : null,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Stats unavailable: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}
