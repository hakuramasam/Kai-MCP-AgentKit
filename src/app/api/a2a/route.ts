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

export const runtime = "nodejs";
export const maxDuration = 30;

// Tools excluded from the paywall (free for A2A callers)
const FREE_TOOLS = new Set(["calculator"]);

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
      .filter((t) => t.function.name !== "delegate_to_agent") // no recursive delegation
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

  // ── Payment gate ────────────────────────────────────────────────────────────
  if (!FREE_TOOLS.has(tool)) {
    const payment = await checkPayment(req, tool);

    if (!payment.paid) {
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

    // Issue a reusable token so caller doesn't need to pay per-request
    if (req.headers.get("x-payment") && !req.headers.get("x-payment-token")) {
      const [txHash] = (req.headers.get("x-payment") ?? "").split(":");
      const token = issueToken({ txHash, toolName: tool, paidBy: payment.paidBy });

      const result = await runTool(tool, args, fid);
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
  const result = await runTool(tool, args, fid);
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
