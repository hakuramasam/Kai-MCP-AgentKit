/**
 * GET /.well-known/agent.json
 *
 * A2A Agent Discovery document.
 * Follows the emerging Agent-to-Agent (A2A) protocol discovery standard.
 * Lets other AI agents and orchestrators auto-discover this agent's
 * capabilities, endpoints, payment requirements, and tool catalog.
 *
 * Safe to expose publicly — contains no secrets.
 */

import { NextResponse } from "next/server";
import { TOOL_DEFINITIONS } from "@/features/agent/lib/tools";
import { getToolPrice, PAYMENT_RECIPIENT } from "@/features/agent/lib/x402";
import { publicConfig } from "@/config/public-config";

export const runtime = "nodejs";

const BLOCKED = new Set(["send_eth", "delegate_to_agent"]);
const FREE    = new Set(["calculator"]);

export async function GET() {
  const tools = TOOL_DEFINITIONS
    .filter((t) => !BLOCKED.has(t.function.name))
    .map((t) => {
      const name  = t.function.name;
      const price = FREE.has(name) ? "0" : getToolPrice(name);
      return {
        name,
        description: t.function.description,
        inputSchema: t.function.parameters,
        payment: {
          required: !FREE.has(name),
          priceEth: price,
          network:  "base",
          chainId:  8453,
        },
      };
    });

  return NextResponse.json(
    {
      // ── Identity ────────────────────────────────────────────────────────────
      schemaVersion: "1.0",
      id:            `${publicConfig.canonicalDomain}/api/a2a`,
      name:          publicConfig.name,
      description:   publicConfig.description,
      version:       "1.0.0",
      url:           `https://${publicConfig.canonicalDomain}`,

      // ── Capabilities ────────────────────────────────────────────────────────
      capabilities: [
        "tool-calling",
        "mcp",
        "x402-payments",
        "streaming",
        "semantic-memory",
        "blockchain-reads",
        "contract-deployment",
        "nft-operations",
        "token-operations",
        "gasless-transactions",
        "ai-inference",
        "ipfs-storage",
      ],

      // ── Endpoints ───────────────────────────────────────────────────────────
      endpoints: {
        a2a: {
          url:         `https://${publicConfig.canonicalDomain}/api/a2a`,
          protocol:    "a2a-rest",
          description: "REST endpoint for direct tool calls. GET for discovery, POST to invoke a tool.",
          methods:     ["GET", "POST"],
        },
        mcp: {
          url:         `https://${publicConfig.canonicalDomain}/api/mcp`,
          protocol:    "mcp-json-rpc-2.0",
          version:     "2024-11-05",
          description: "MCP JSON-RPC 2.0 endpoint. Supports initialize, tools/list, tools/call.",
          methods:     ["POST"],
        },
        catalog: {
          url:         `https://${publicConfig.canonicalDomain}/api/tools`,
          description: "Full tool catalog with parameters, pricing tiers, and usage docs.",
          methods:     ["GET"],
        },
      },

      // ── Payment ─────────────────────────────────────────────────────────────
      payment: {
        protocol:  "x402",
        network:   "base",
        chainId:   8453,
        recipient: PAYMENT_RECIPIENT,
        flow: [
          "POST /api/a2a { tool, args } — no payment header",
          "← 402 { price, recipient, nonce, expiresAt }",
          "Send exactly `price` ETH to `recipient` on Base, with `nonce` hex-encoded in tx.data",
          "POST /api/a2a with header X-Payment: <txHash>:<nonce>",
          "← 200 { result, token } — save X-Payment-Token for 10-minute reuse",
        ],
        rateLimits: {
          unauthenticated: "60 requests/minute per IP",
          authenticated:   "300 requests/minute per paying address",
        },
      },

      // ── Tools ───────────────────────────────────────────────────────────────
      tools,

      // ── Security ────────────────────────────────────────────────────────────
      security: {
        blockedTools:       ["send_eth"],
        replayProtection:   true,
        nonceExpiry:        "5 minutes",
        tokenExpiry:        "10 minutes",
        addressRequirement: "check_wallet_balance and get_recent_transactions require an explicit address parameter",
      },

      // ── Meta ────────────────────────────────────────────────────────────────
      contact: {
        farcaster: `https://warpcast.com/haku85`,
        homepage:  `https://${publicConfig.canonicalDomain}`,
        catalog:   `https://${publicConfig.canonicalDomain}/api/tools`,
        discovery: `https://${publicConfig.canonicalDomain}/.well-known/agent.json`,
      },
      generatedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        "Content-Type":  "application/json",
      },
    },
  );
}
