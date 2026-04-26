/**
 * GET /api/tools — Public tool catalog with pricing.
 *
 * A clean human/machine-readable listing of every available tool,
 * its description, parameters, price, and payment instructions.
 * Safe to expose publicly — contains no secrets.
 */

import { NextResponse } from "next/server";
import { TOOL_DEFINITIONS } from "@/features/agent/lib/tools";
import { getToolPrice, PAYMENT_RECIPIENT, TOOL_PRICES } from "@/features/agent/lib/x402";

export const runtime = "nodejs";

const BLOCKED = new Set(["send_eth", "delegate_to_agent"]);
const FREE    = new Set(["calculator"]);

const TOOL_ICONS: Record<string, string> = {
  get_weather:              "🌤",
  calculator:               "🧮",
  web_search:               "🔍",
  save_memory:              "🧠",
  recall_memory:            "💭",
  analyze_data:             "📊",
  fetch_url:                "🌐",
  run_code:                 "⚙️",
  check_wallet_balance:     "💰",
  get_recent_transactions:  "📜",
  market_data:              "📈",
  base_tx_lookup:           "🔗",
  text_analysis:            "🔬",
  code_review:              "🛡",
  image_caption:            "🖼",
  deploy_contract:          "🚀",
  nft_write:                "🎭",
  token_write:              "🪙",
  thirdweb_ai:              "🔮",
  nft_data:                 "🎨",
  read_contract:            "📜",
  ipfs:                     "📦",
};

const TIER_LABELS: Record<string, string> = {
  "0":       "free",
  "0.00001": "light",
  "0.00003": "medium",
  "0.00005": "standard",
  "0.0001":  "heavy",
  "0.0002":  "premium",
};

function tier(price: string) {
  return TIER_LABELS[price] ?? "standard";
}

export async function GET() {
  const tools = TOOL_DEFINITIONS
    .filter((t) => !BLOCKED.has(t.function.name))
    .map((t) => {
      const name  = t.function.name;
      const price = FREE.has(name) ? "0" : getToolPrice(name);
      return {
        name,
        icon:        TOOL_ICONS[name] ?? "🔧",
        description: t.function.description,
        parameters:  t.function.parameters,
        pricing: {
          priceEth:  price,
          tier:      tier(price),
          free:      FREE.has(name),
          priceUsd:  price === "0" ? "$0.00" : `~$${(parseFloat(price) * 3000).toFixed(4)}`,
        },
      };
    });

  // Group into tiers for easy browsing
  const byTier: Record<string, typeof tools> = {};
  for (const t of tools) {
    const tl = t.pricing.tier;
    (byTier[tl] ??= []).push(t);
  }

  return NextResponse.json(
    {
      name:        "AgentKit Tool Catalog",
      version:     "1.0.0",
      description: "All available tools with pricing. Call tools via /api/a2a (REST) or /api/mcp (MCP JSON-RPC).",
      totalTools:  tools.length,
      payment: {
        protocol:  "x402",
        network:   "base",
        chainId:   8453,
        recipient: PAYMENT_RECIPIENT,
        tokenTtl:  "10 minutes — one payment issues a reusable bearer token",
        docs:      "POST /api/a2a with no payment → receive 402 challenge → pay on-chain → retry with X-Payment header",
      },
      endpoints: {
        rest:      "/api/a2a",
        mcp:       "/api/mcp",
        catalog:   "/api/tools",
        discovery: "/.well-known/agent.json",
      },
      tiers: {
        free:     "No payment required",
        light:    "0.00001 ETH (~$0.03) — fast read-only operations",
        medium:   "0.00003 ETH (~$0.09) — data fetch + storage",
        standard: "0.00005 ETH (~$0.15) — external calls",
        heavy:    "0.0001 ETH  (~$0.30) — AI inference",
        premium:  "0.0002 ETH  (~$0.60) — multi-agent orchestration",
      },
      tools,
      byTier,
      allPrices: TOOL_PRICES,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
}
