/**
 * x402 payment layer for AgentKit A2A / MCP endpoints.
 *
 * Protocol:
 *   1. Client calls /api/a2a or /api/mcp — no payment header
 *   2. Server returns HTTP 402 with { price, recipient, nonce, expiresAt }
 *   3. Client sends ETH on Base (exact amount to recipient)
 *   4. Client retries with X-Payment: <txHash>:<nonce>
 *   5. Server verifies on-chain, issues a short-lived bearer token
 *   6. Subsequent requests use X-Payment-Token: <token> (valid for 10 min)
 *
 * On-chain verification uses Base Mainnet public RPC.
 * Payment tokens are HMAC-SHA256 signed with PAYMENT_SECRET.
 */

import { createPublicClient, http, parseEther, formatEther } from "viem";
import { base } from "viem/chains";
import { createHmac, randomBytes } from "crypto";
import { consumeNonce } from "@/features/agent/lib/nonce-store";

// ─── Config ───────────────────────────────────────────────────────────────────

/** Address that receives payments — the app's server wallet */
export const PAYMENT_RECIPIENT =
  (process.env.NEYNAR_WALLET_ADDRESS as `0x${string}`) ??
  "0xd7e2341c4ca1de1c1f55a9514d8e720a60a9a87e";

/** Secret for signing payment tokens — fallback to a derived key */
const PAYMENT_SECRET =
  process.env.PAYMENT_SECRET ?? `agentkit-x402-${process.env.NEYNAR_API_KEY ?? "dev"}`;

/** Token validity window */
const TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** How far in the past we accept a tx (prevents replay from very old blocks) */
const TX_FRESHNESS_MS = 5 * 60 * 1000; // 5 minutes

// ─── Per-tool pricing (in ETH) ────────────────────────────────────────────────

export const TOOL_PRICES: Record<string, string> = {
  // Light tools — 0.00001 ETH (~$0.03 at $3000/ETH)
  calculator: "0.00001",
  get_weather: "0.00001",
  analyze_data: "0.00001",
  market_data: "0.00001",      // CoinGecko free tier, minimal cost
  base_tx_lookup: "0.00001",   // RPC read-only, very cheap

  // Medium tools — 0.00003 ETH (~$0.09)
  save_memory: "0.00003",
  recall_memory: "0.00003",
  web_search: "0.00003",
  text_analysis: "0.00003",    // LLM inference (fast model)

  // Heavy tools — 0.00005 ETH (~$0.15)
  fetch_url: "0.00005",
  run_code: "0.00005",
  get_recent_transactions: "0.00005",
  image_caption: "0.00005",    // Vision model inference

  // AI-heavy tools — 0.0001 ETH (~$0.30)
  code_review: "0.0001",       // Larger model + longer output
  check_wallet_balance: "0.0001",
  send_eth: "0.0001",
  thirdweb_ai: "0.0001",       // Nebula AI inference

  // Thirdweb on-chain tools
  deploy_contract: "0.0001",   // Native SDK + optional Nebula — heavy
  nft_write: "0.0001",         // On-chain NFT mint/transfer/burn — heavy (gas + signing)
  token_write: "0.0001",       // On-chain ERC-20 mint/transfer/burn — heavy (gas + signing)
  read_contract: "0.00001",    // Read-only RPC call — light
  nft_data: "0.00003",         // RPC + IPFS metadata fetch — medium
  ipfs: "0.00003",             // Storage upload/download — medium

  // Multi-agent — 0.0002 ETH (~$0.60, covers sub-agent calls)
  delegate_to_agent: "0.0002",

  // Default fallback
  default: "0.00003",
};

export function getToolPrice(toolName: string): string {
  return TOOL_PRICES[toolName] ?? TOOL_PRICES.default!;
}

/** Total price for a batch of tools (sum, capped at 0.001 ETH) */
export function getBatchPrice(toolNames: string[]): string {
  const total = toolNames.reduce((sum, t) => {
    return sum + parseFloat(getToolPrice(t));
  }, 0);
  const capped = Math.min(total, 0.001);
  return capped.toFixed(6);
}

// ─── Payment challenge ────────────────────────────────────────────────────────

export interface PaymentChallenge {
  price: string;       // ETH amount as string
  priceWei: string;    // wei as string
  recipient: string;   // address to pay
  nonce: string;       // random nonce — included in response, verified in tx data
  expiresAt: string;   // ISO timestamp
  network: "base";
  chainId: 8453;
}

export function createChallenge(priceEth: string): PaymentChallenge {
  const nonce = randomBytes(8).toString("hex");
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 min to pay

  return {
    price: priceEth,
    priceWei: parseEther(priceEth).toString(),
    recipient: PAYMENT_RECIPIENT,
    nonce,
    expiresAt,
    network: "base",
    chainId: 8453,
  };
}

// ─── On-chain verification ────────────────────────────────────────────────────

const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL ?? "https://mainnet.base.org"),
});

export interface VerifyResult {
  valid: boolean;
  error?: string;
  amountEth?: string;
  from?: string;
}

export async function verifyPayment(
  txHash: string,
  expectedAmountEth: string,
  nonce: string,
): Promise<VerifyResult> {
  if (!txHash.startsWith("0x") || txHash.length !== 66) {
    return { valid: false, error: "Invalid transaction hash format" };
  }

  try {
    const [receipt, tx] = await Promise.all([
      publicClient.getTransactionReceipt({ hash: txHash as `0x${string}` }),
      publicClient.getTransaction({ hash: txHash as `0x${string}` }),
    ]);

    // Must be successful
    if (receipt.status !== "success") {
      return { valid: false, error: "Transaction reverted or failed" };
    }

    // Must go to our wallet
    if (tx.to?.toLowerCase() !== PAYMENT_RECIPIENT.toLowerCase()) {
      return { valid: false, error: `Payment must go to ${PAYMENT_RECIPIENT}` };
    }

    // Amount must be >= expected (allow slight overpay, not underpay)
    const expectedWei = parseEther(expectedAmountEth);
    if (tx.value < expectedWei) {
      return {
        valid: false,
        error: `Insufficient payment. Expected ${expectedAmountEth} ETH, got ${formatEther(tx.value)} ETH`,
      };
    }

    // Must be recent enough (anti-replay)
    const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber });
    const txTimestamp = Number(block.timestamp) * 1000;
    if (Date.now() - txTimestamp > TX_FRESHNESS_MS) {
      return { valid: false, error: "Transaction too old — must be within 5 minutes" };
    }

    // Consume the nonce — reject replays of the same tx+nonce
    if (!consumeNonce(txHash, nonce)) {
      return { valid: false, error: "Payment proof already used (replay rejected)" };
    }

    return {
      valid: true,
      amountEth: formatEther(tx.value),
      from: tx.from,
    };
  } catch (err) {
    return {
      valid: false,
      error: `Verification failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── Payment tokens (short-lived bearer) ────────────────────────────────────

export interface PaymentToken {
  token: string;
  expiresAt: string;
  toolName?: string;    // if scoped to a specific tool
  paidBy?: string;      // ETH address that paid
}

export function issueToken(params: {
  txHash: string;
  toolName?: string;
  paidBy?: string;
}): PaymentToken {
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  const payload = `${params.txHash}:${params.toolName ?? "*"}:${expiresAt}:${params.paidBy ?? ""}`;
  const sig = createHmac("sha256", PAYMENT_SECRET).update(payload).digest("hex");
  const token = Buffer.from(`${payload}:${sig}`).toString("base64url");

  return { token, expiresAt, toolName: params.toolName, paidBy: params.paidBy };
}

export function verifyToken(token: string): {
  valid: boolean;
  toolName?: string;
  paidBy?: string;
  error?: string;
} {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const parts = decoded.split(":");
    if (parts.length < 5) return { valid: false, error: "Malformed token" };

    const sig = parts.pop()!;
    const full = parts.join(":");
    const expectedSig = createHmac("sha256", PAYMENT_SECRET).update(full).digest("hex");
    if (sig !== expectedSig) return { valid: false, error: "Invalid token signature" };

    // parts = [txHash, toolName, expiresAt, paidBy]
    const expiresAt = parts[2];
    if (!expiresAt || new Date(expiresAt) < new Date()) {
      return { valid: false, error: "Token expired" };
    }

    return {
      valid: true,
      toolName: parts[1] === "*" ? undefined : parts[1],
      paidBy: parts[3] ?? undefined,
    };
  } catch {
    return { valid: false, error: "Token parse error" };
  }
}

// ─── Middleware helper ────────────────────────────────────────────────────────

/**
 * Check if a request has a valid payment (token or tx).
 * Returns { paid: true } or { paid: false, challenge } to embed in 402.
 */
export async function checkPayment(
  req: Request,
  toolName: string,
): Promise<
  | { paid: true; paidBy?: string }
  | { paid: false; challenge: PaymentChallenge }
> {
  // 1. Check for bearer token
  const tokenHeader = req.headers.get("x-payment-token");
  if (tokenHeader) {
    const result = verifyToken(tokenHeader);
    if (result.valid) {
      // Token must be for this tool or be a wildcard
      if (!result.toolName || result.toolName === toolName) {
        return { paid: true, paidBy: result.paidBy };
      }
    }
  }

  // 2. Check for tx hash + nonce (one-time payment)
  const paymentHeader = req.headers.get("x-payment");
  if (paymentHeader) {
    const [txHash, nonce] = paymentHeader.split(":");
    if (txHash && nonce) {
      const price = getToolPrice(toolName);
      const result = await verifyPayment(txHash, price, nonce);
      if (result.valid) {
        return { paid: true, paidBy: result.from };
      }
    }
  }

  // 3. No valid payment — issue challenge
  const price = getToolPrice(toolName);
  return { paid: false, challenge: createChallenge(price) };
}
