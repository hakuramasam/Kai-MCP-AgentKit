/**
 * /api/mcp — Model Context Protocol endpoint with x402 paywall.
 *
 * Implements the MCP JSON-RPC 2.0 wire format so any MCP-compatible
 * client (Claude Desktop, Cursor, other LLMs) can use AgentKit tools.
 *
 * Supported MCP methods:
 *   initialize          — handshake, returns server capabilities
 *   tools/list          — list all available tools (free)
 *   tools/call          — execute a tool (requires x402 payment)
 *
 * Payment:
 *   Same x402 protocol as /api/a2a
 *   X-Payment: <txHash>:<nonce>
 *   X-Payment-Token: <token>      (reusable 10 min bearer)
 */

import { NextRequest, NextResponse } from "next/server";
import { executeTool, TOOL_DEFINITIONS } from "@/features/agent/lib/tools";
import {
  checkPayment,
  issueToken,
  getToolPrice,
  PAYMENT_RECIPIENT,
} from "@/features/agent/lib/x402";
import {
  saveMemoryWithEmbedding,
  recallMemoriesSemantic,
} from "@/features/agent/lib/vector-memory";
import { enforceRateLimit } from "@/features/agent/lib/rate-limiter";
import { recordPayment, recordToolCall } from "@/db/actions/payment-actions";

export const runtime = "nodejs";
export const maxDuration = 30;

// MCP JSON-RPC 2.0 types
interface MCPRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
}

interface MCPResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

function ok(id: string | number | null | undefined, result: unknown): MCPResponse {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function err(id: string | number | null | undefined, code: number, message: string, data?: unknown): MCPResponse {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message, data } };
}

// MCP error codes
const MCP_PARSE_ERROR = -32700;
const MCP_INVALID_REQUEST = -32600;
const MCP_METHOD_NOT_FOUND = -32601;
const MCP_INVALID_PARAMS = -32602;
const MCP_INTERNAL_ERROR = -32603;
const MCP_PAYMENT_REQUIRED = -32000; // custom

// Tools free to call without payment
const FREE_TOOLS = new Set(["calculator"]);

/**
 * Tools BLOCKED on external endpoints (A2A / MCP) for security.
 * send_eth: no external agent may trigger outbound transfers from the server wallet.
 */
const EXTERNAL_BLOCKED_TOOLS = new Set(["send_eth"]);

export async function POST(req: NextRequest) {
  let rpc: MCPRequest;

  try {
    rpc = await req.json() as MCPRequest;
  } catch {
    return jsonrpcError(null, MCP_PARSE_ERROR, "Parse error");
  }

  if (!rpc.jsonrpc || rpc.jsonrpc !== "2.0" || !rpc.method) {
    return jsonrpcError(rpc.id ?? null, MCP_INVALID_REQUEST, "Invalid JSON-RPC 2.0 request");
  }

  const { method, params, id } = rpc;

  // ── Rate limit — skip for free/meta methods ──────────────────────────────
  const freeMethods = new Set(["initialize", "tools/list", "notifications/initialized"]);
  if (!freeMethods.has(method)) {
    const rl = enforceRateLimit(req);
    if (!rl.allowed) {
      return NextResponse.json(
        err(id, -32029, "Too many requests", {
          retryAfter: Math.ceil((rl.resetAt - Date.now()) / 1000),
          limit: "60 requests/minute per IP (unauthenticated)",
          upgrade: "Pay with x402 to get 300 requests/minute tied to your address",
        }),
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
            "X-RateLimit-Limit": "60",
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.floor(rl.resetAt / 1000)),
          },
        },
      );
    }
  }

  // ── initialize ──────────────────────────────────────────────────────────────
  if (method === "initialize") {
    return jsonrpcOk(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: { listChanged: false } },
      serverInfo: {
        name: "AgentKit MCP",
        version: "1.0.0",
        description: "AgentKit tools via MCP. Tool execution requires x402 payment on Base.",
      },
      payment: {
        protocol: "x402",
        recipient: PAYMENT_RECIPIENT,
        network: "base",
        chainId: 8453,
        headers: {
          payment: "X-Payment",
          token: "X-Payment-Token",
        },
      },
    });
  }

  // ── tools/list ──────────────────────────────────────────────────────────────
  if (method === "tools/list") {
    const tools = TOOL_DEFINITIONS
      .filter((t) => t.function.name !== "delegate_to_agent")
      .filter((t) => !EXTERNAL_BLOCKED_TOOLS.has(t.function.name))
      .map((t) => ({
        name: t.function.name,
        description: t.function.description,
        inputSchema: t.function.parameters,
        _x402: {
          priceEth: getToolPrice(t.function.name),
          free: FREE_TOOLS.has(t.function.name),
          paymentRecipient: PAYMENT_RECIPIENT,
          network: "base",
        },
      }));

    return jsonrpcOk(id, { tools });
  }

  // ── tools/call ──────────────────────────────────────────────────────────────
  if (method === "tools/call") {
    const p = params as { name?: string; arguments?: unknown } | undefined;

    if (!p?.name) {
      return jsonrpcError(id, MCP_INVALID_PARAMS, "Missing params.name");
    }

    const toolName = p.name;
    const toolDef = TOOL_DEFINITIONS.find((t) => t.function.name === toolName);
    if (!toolDef) {
      return jsonrpcError(id, MCP_METHOD_NOT_FOUND, `Unknown tool: ${toolName}`);
    }

    if (toolName === "delegate_to_agent") {
      return jsonrpcError(id, MCP_INVALID_PARAMS, "delegate_to_agent is not available via MCP.");
    }

    // Block wallet-draining tools on external endpoints
    if (EXTERNAL_BLOCKED_TOOLS.has(toolName)) {
      return jsonrpcError(
        id,
        MCP_INVALID_PARAMS,
        `Tool "${toolName}" is not available via MCP for security reasons. Outbound transfers from the server wallet cannot be triggered by external agents.`,
      );
    }

    // Require explicit address for server-wallet-sensitive read tools
    const callArgs = (params as { name?: string; arguments?: Record<string, unknown> } | undefined)?.arguments ?? {};
    if (
      (toolName === "check_wallet_balance" || toolName === "get_recent_transactions") &&
      !callArgs.address
    ) {
      return jsonrpcError(
        id,
        MCP_INVALID_PARAMS,
        `Tool "${toolName}" requires an explicit "address" parameter when called via MCP. External callers cannot read the server wallet's own data.`,
      );
    }

    // ── Payment gate ──────────────────────────────────────────────────────────
    let resolvedPaidBy: string | undefined;

    if (!FREE_TOOLS.has(toolName)) {
      const payment = await checkPayment(req, toolName);

      if (!payment.paid) {
        const paymentData = {
          ...payment.challenge,
          instructions: [
            `Send ${payment.challenge.price} ETH to ${payment.challenge.recipient} on Base (chainId 8453)`,
            `Retry with header X-Payment: <txHash>:${payment.challenge.nonce}`,
            `Save returned X-Payment-Token for subsequent calls (valid 10 min)`,
          ],
        };

        return NextResponse.json(
          err(id, MCP_PAYMENT_REQUIRED, "Payment required", paymentData),
          {
            status: 402,
            headers: {
              "Content-Type": "application/json",
              "X-Payment-Required": "true",
              "X-Payment-Recipient": payment.challenge.recipient,
              "X-Payment-Amount": payment.challenge.price,
            },
          },
        );
      }

      resolvedPaidBy = payment.paidBy;

      // Payment verified — upgrade to address-level rate limit
      if (resolvedPaidBy) {
        const addrRl = enforceRateLimit(req, resolvedPaidBy);
        if (!addrRl.allowed) {
          return NextResponse.json(
            err(id, -32029, "Too many requests", {
              retryAfter: Math.ceil((addrRl.resetAt - Date.now()) / 1000),
              limit: "300 requests/minute per paying address",
            }),
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

      // First-time payment → issue token + persist ledger
      if (req.headers.get("x-payment") && !req.headers.get("x-payment-token")) {
        const [txHash, nonce] = (req.headers.get("x-payment") ?? "").split(":");
        const token = issueToken({ txHash, toolName, paidBy: resolvedPaidBy });

        void recordPayment({
          txHash: txHash ?? "",
          nonce: nonce ?? "",
          paidBy: resolvedPaidBy ?? "unknown",
          toolName,
          amountEth: getToolPrice(toolName),
          endpoint: "mcp",
          tokenIssued: token.token,
        });

        const start = Date.now();
        let result: unknown;
        try {
          result = await callTool(toolName, p.arguments, 0);
          void recordToolCall({ toolName, source: "mcp", callerAddress: resolvedPaidBy, success: true, durationMs: Date.now() - start });
        } catch (e) {
          void recordToolCall({ toolName, source: "mcp", callerAddress: resolvedPaidBy, success: false, durationMs: Date.now() - start });
          return jsonrpcError(id, MCP_INTERNAL_ERROR, `Tool execution failed: ${e instanceof Error ? e.message : String(e)}`);
        }

        return NextResponse.json(
          ok(id, { content: [{ type: "text", text: formatToolResult(result) }] }),
          {
            headers: {
              "X-Payment-Token": token.token,
              "X-Payment-Token-Expires": token.expiresAt,
            },
          },
        );
      }
    }

    // ── Execute (free tools + token-reuse path) ───────────────────────────────
    const execStart = Date.now();
    try {
      const result = await callTool(toolName, p.arguments, 0);
      void recordToolCall({ toolName, source: "mcp", callerAddress: resolvedPaidBy, success: true, durationMs: Date.now() - execStart });
      return jsonrpcOk(id, {
        content: [{ type: "text", text: formatToolResult(result) }],
      });
    } catch (e) {
      void recordToolCall({ toolName, source: "mcp", callerAddress: resolvedPaidBy, success: false, durationMs: Date.now() - execStart });
      return jsonrpcError(id, MCP_INTERNAL_ERROR, `Tool execution failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ── notifications/initialized (no response needed per spec) ─────────────────
  if (method === "notifications/initialized") {
    return new Response(null, { status: 204 });
  }

  return jsonrpcError(id, MCP_METHOD_NOT_FOUND, `Method not found: ${method}`);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function callTool(name: string, args: unknown, fid: number): Promise<unknown> {
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

  const raw = await executeTool(name, JSON.stringify(args ?? {}), ctx);
  try { return JSON.parse(raw) as unknown; } catch { return raw; }
}

function formatToolResult(result: unknown): string {
  if (typeof result === "string") return result;
  return JSON.stringify(result, null, 2);
}

function jsonrpcOk(id: string | number | null | undefined, result: unknown): NextResponse {
  return NextResponse.json(ok(id, result), {
    headers: { "Content-Type": "application/json" },
  });
}

function jsonrpcError(
  id: string | number | null | undefined,
  code: number,
  message: string,
  data?: unknown,
): NextResponse {
  return NextResponse.json(err(id, code, message, data), {
    headers: { "Content-Type": "application/json" },
  });
}
