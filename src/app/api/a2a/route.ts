/**
 * /api/a2a — Agent-to-Agent endpoint with x402 paywall.
 *
 * External agents call this to invoke AgentKit tools directly.
 * Chat (simple text) is free. Tool execution costs ETH on Base.
 *
 * Flow:
 *   POST /api/a2a { tool, args }
 *   → 402 { challenge } if no payment
 *   → client pays on-chain, retries with X-Payment header
 *   → 200 { result, token } — token reusable for 10 min
 *
 * Supported headers:
 *   X-Payment: <txHash>:<nonce>         — one-time payment proof
 *   X-Payment-Token: <token>            — reusable bearer token (10 min)
 */

import { NextRequest, NextResponse } from "next/server";
import { executeTool, TOOL_DEFINITIONS } from "@/features/agent/lib/tools";
import {
  checkPayment,
  issueToken,
  getToolPrice,
  TOOL_PRICES,
  PAYMENT_RECIPIENT,
  verifyPayment,
} from "@/features/agent/lib/x402";
import {
  saveMemoryWithEmbedding,
  recallMemoriesSemantic,
} from "@/features/agent/lib/vector-memory";
import { enforceRateLimit } from "@/features/agent/lib/rate-limiter";
import { recordPayment, recordToolCall } from "@/db/actions/payment-actions";

export const runtime = "nodejs";
export const maxDuration = 30;

// Tools excluded from the paywall (free for A2A callers)
const FREE_TOOLS = new Set(["calculator"]);

/**
 * Tools BLOCKED on external endpoints (A2A / MCP) for security.
 *
 * send_eth        — would let any paying agent drain the server wallet.
 * check_wallet_balance (no-arg) — leaks server wallet address/balance to
 *                   outsiders. External callers must supply an explicit address.
 * get_recent_transactions (no-arg) — leaks server wallet tx history.
 *
 * These tools remain fully available in the normal chat interface where
 * the user is authenticated via Farcaster and the agent controls execution.
 */
const EXTERNAL_BLOCKED_TOOLS = new Set([
  "send_eth", // CRITICAL: no outbound transfers from the server wallet via API
]);

export async function GET() {
  // Discovery endpoint — list available tools + pricing
  return NextResponse.json({
    name: "AgentKit A2A",
    version: "1.0.0",
    description: "Agent-to-Agent API for AgentKit tools. Uses x402 payment protocol on Base Mainnet.",
    paymentRecipient: PAYMENT_RECIPIENT,
    network: "base",
    chainId: 8453,
    tools: TOOL_DEFINITIONS
      .filter((t) => t.function.name !== "delegate_to_agent")
      .filter((t) => !EXTERNAL_BLOCKED_TOOLS.has(t.function.name))
      .map((t) => ({
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
        priceEth: getToolPrice(t.function.name),
        free: FREE_TOOLS.has(t.function.name),
      })),
    pricing: TOOL_PRICES,
    auth: {
      type: "x402",
      paymentHeader: "X-Payment",
      tokenHeader: "X-Payment-Token",
      docs: "Send ETH to paymentRecipient on Base, then include X-Payment: <txHash>:<nonce> from the 402 challenge.",
    },
  });
}

export async function POST(req: NextRequest) {
  let body: { tool?: string; args?: unknown; fid?: number };

  try {
    body = await req.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { tool, args, fid = 0 } = body;

  if (!tool) {
    return NextResponse.json({ error: "Missing required field: tool" }, { status: 400 });
  }

  // ── Rate limit — IP only at this point (address resolved after payment) ────
  // We'll re-check after payment to swap to the generous address limit.
  const earlyRl = enforceRateLimit(req);
  if (!earlyRl.allowed) {
    return NextResponse.json(
      {
        error: "Too many requests",
        retryAfter: Math.ceil((earlyRl.resetAt - Date.now()) / 1000),
        limit: "60 requests/minute per IP (unauthenticated)",
        upgrade: "Pay with x402 to get 300 requests/minute tied to your address",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((earlyRl.resetAt - Date.now()) / 1000)),
          "X-RateLimit-Limit": "60",
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.floor(earlyRl.resetAt / 1000)),
        },
      },
    );
  }

  // Verify tool exists
  const toolDef = TOOL_DEFINITIONS.find((t) => t.function.name === tool);
  if (!toolDef) {
    return NextResponse.json(
      { error: `Unknown tool: ${tool}. GET /api/a2a for the full list.` },
      { status: 404 },
    );
  }

  // Block recursive delegation via A2A
  if (tool === "delegate_to_agent") {
    return NextResponse.json(
      { error: "delegate_to_agent is not available via A2A to prevent recursive billing." },
      { status: 400 },
    );
  }

  // Block wallet-draining and sensitive tools on external endpoints
  if (EXTERNAL_BLOCKED_TOOLS.has(tool)) {
    return NextResponse.json(
      {
        error: `Tool "${tool}" is not available via A2A for security reasons.`,
        reason: "Outbound transfers from the server wallet cannot be triggered by external agents. Use the chat interface for wallet operations.",
      },
      { status: 403 },
    );
  }

  // For check_wallet_balance and get_recent_transactions: require explicit address
  // (prevent external callers from reading the server wallet's own info)
  if (
    (tool === "check_wallet_balance" || tool === "get_recent_transactions") &&
    typeof args === "object" &&
    args !== null &&
    !("address" in args && typeof (args as Record<string, unknown>).address === "string")
  ) {
    return NextResponse.json(
      {
        error: `Tool "${tool}" requires an explicit "address" parameter when called via A2A.`,
        reason: "External callers cannot read the server wallet's own balance or transaction history.",
      },
      { status: 400 },
    );
  }

  // ── Payment gate ────────────────────────────────────────────────────────────
  if (!FREE_TOOLS.has(tool)) {
    const payment = await checkPayment(req, tool);

    if (!payment.paid) {
      // Charge the IP slot back — this request won't proceed
      return NextResponse.json(
        {
          error: "Payment required",
          code: 402,
          tool,
          ...payment.challenge,
          instructions: [
            `1. Send exactly ${payment.challenge.price} ETH to ${payment.challenge.recipient} on Base Mainnet (chainId 8453)`,
            `2. Include nonce "${payment.challenge.nonce}" in the tx data field (hex-encoded)`,
            `3. Retry this request with header: X-Payment: <txHash>:${payment.challenge.nonce}`,
            `4. On success, save the returned X-Payment-Token for reuse (valid 10 minutes)`,
          ],
        },
        {
          status: 402,
          headers: {
            "X-Payment-Required": "true",
            "X-Payment-Recipient": payment.challenge.recipient,
            "X-Payment-Amount": payment.challenge.price,
            "X-Payment-Network": "base",
            "X-Payment-Chain-Id": "8453",
          },
        },
      );
    }

    // Payment verified — swap to the generous address-level rate limit
    if (payment.paidBy) {
      const addrRl = enforceRateLimit(req, payment.paidBy);
      if (!addrRl.allowed) {
        return NextResponse.json(
          {
            error: "Too many requests",
            retryAfter: Math.ceil((addrRl.resetAt - Date.now()) / 1000),
            limit: "300 requests/minute per paying address",
          },
          {
            status: 429,
            headers: {
              "Retry-After": String(Math.ceil((addrRl.resetAt - Date.now()) / 1000)),
              "X-RateLimit-Limit": "300",
              "X-RateLimit-Remaining": "0",
              "X-RateLimit-Reset": String(Math.floor(addrRl.resetAt / 1000)),
            },
          },
        );
      }
    }

    // Issue a reusable token so caller doesn't need to pay per-request
    if (req.headers.get("x-payment") && !req.headers.get("x-payment-token")) {
      const [txHash, nonce] = (req.headers.get("x-payment") ?? "").split(":");
      const token = issueToken({ txHash, toolName: tool, paidBy: payment.paidBy });

      // Persist payment to ledger (non-blocking)
      void recordPayment({
        txHash: txHash ?? "",
        nonce: nonce ?? "",
        paidBy: payment.paidBy ?? "unknown",
        toolName: tool,
        amountEth: getToolPrice(tool),
        endpoint: "a2a",
        tokenIssued: token.token,
      });

      const start = Date.now();
      const result = await runTool(tool, args, fid);
      void recordToolCall({ toolName: tool, source: "a2a", callerAddress: payment.paidBy, success: true, durationMs: Date.now() - start });

      return NextResponse.json(
        { result, token: token.token, tokenExpiresAt: token.expiresAt },
        {
          headers: {
            "X-Payment-Token": token.token,
            "X-Payment-Token-Expires": token.expiresAt,
          },
        },
      );
    }
  }

  // ── Execute tool ────────────────────────────────────────────────────────────
  const start = Date.now();
  const result = await runTool(tool, args, fid);
  void recordToolCall({ toolName: tool, source: "a2a", callerAddress: undefined, success: true, durationMs: Date.now() - start });
  return NextResponse.json({ result });
}

async function runTool(tool: string, args: unknown, fid: number): Promise<unknown> {
  const ctx = {
    fid,
    onMemorySave: async (content: string, category: string, importance: number) => {
      await saveMemoryWithEmbedding({ fid, content, category, importance });
    },
    onMemoryRecall: async (query: string, category: string) => {
      const results = await recallMemoriesSemantic({
        fid,
        query,
        category: category === "all" ? undefined : category,
        limit: 5,
      });
      return results.map((r) => ({
        content: r.content,
        category: r.category,
        similarity: r.similarity,
      }));
    },
  };

  const argsJson = JSON.stringify(args ?? {});
  const rawResult = await executeTool(tool, argsJson, ctx);

  try {
    return JSON.parse(rawResult) as unknown;
  } catch {
    return rawResult;
  }
}
