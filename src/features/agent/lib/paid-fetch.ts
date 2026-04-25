/**
 * paid-fetch — auto-payment client for x402 endpoints.
 *
 * Wraps fetch() with automatic 402 handling:
 *   1. Makes the request normally
 *   2. If 402 received, parses the challenge
 *   3. Sends ETH on Base using WALLET_PRIVATE_KEY
 *   4. Retries with X-Payment header
 *   5. Saves the returned token for subsequent calls
 *
 * Usage:
 *   const result = await paidFetch("https://other-agent.com/api/a2a", {
 *     method: "POST",
 *     body: JSON.stringify({ tool: "web_search", args: { query: "..." } })
 *   });
 */

import { createWalletClient, createPublicClient, http, parseEther } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

// ─── Token cache (in-memory, per process) ─────────────────────────────────────

const tokenCache = new Map<string, { token: string; expiresAt: Date }>();

function getCachedToken(url: string, toolName?: string): string | null {
  const key = `${url}:${toolName ?? "*"}`;
  const entry = tokenCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < new Date()) {
    tokenCache.delete(key);
    return null;
  }
  return entry.token;
}

function setCachedToken(url: string, toolName: string | undefined, token: string, expiresAt: string) {
  const key = `${url}:${toolName ?? "*"}`;
  tokenCache.set(key, { token, expiresAt: new Date(expiresAt) });
}

// ─── Wallet setup ─────────────────────────────────────────────────────────────

function getWalletClient() {
  const rawKey = process.env.WALLET_PRIVATE_KEY;
  if (!rawKey?.startsWith("0x")) throw new Error("WALLET_PRIVATE_KEY not configured");
  const account = privateKeyToAccount(rawKey as `0x${string}`);
  return {
    client: createWalletClient({ account, chain: base, transport: http() }),
    publicClient: createPublicClient({ chain: base, transport: http() }),
    account,
  };
}

// ─── Challenge type (mirrors x402.ts PaymentChallenge) ───────────────────────

interface PaymentChallenge {
  price: string;
  priceWei: string;
  recipient: string;
  nonce: string;
  expiresAt: string;
  chainId: number;
}

// ─── Main paidFetch ───────────────────────────────────────────────────────────

export interface PaidFetchOptions extends RequestInit {
  toolName?: string;   // for token cache scoping
  maxRetries?: number; // default 1
}

export async function paidFetch(url: string, options: PaidFetchOptions = {}): Promise<Response> {
  const { toolName, maxRetries = 1, ...fetchOpts } = options;

  // Try cached token first
  const cached = getCachedToken(url, toolName);
  if (cached) {
    const res = await fetch(url, {
      ...fetchOpts,
      headers: { ...(fetchOpts.headers as Record<string, string>), "X-Payment-Token": cached },
    });
    if (res.status !== 402) return res;
    // Token expired/invalid — clear and fall through
    tokenCache.delete(`${url}:${toolName ?? "*"}`);
  }

  // Initial request (no payment)
  let res = await fetch(url, fetchOpts);

  for (let attempt = 0; attempt < maxRetries && res.status === 402; attempt++) {
    const body = await res.json() as PaymentChallenge & { error?: string };
    const challenge: PaymentChallenge = body;

    if (!challenge.price || !challenge.recipient || !challenge.nonce) {
      throw new Error(`Invalid 402 challenge from ${url}: ${JSON.stringify(body)}`);
    }

    // Pay on-chain
    const txHash = await payChallenge(challenge);

    // Retry with payment proof
    res = await fetch(url, {
      ...fetchOpts,
      headers: {
        ...(fetchOpts.headers as Record<string, string>),
        "X-Payment": `${txHash}:${challenge.nonce}`,
      },
    });

    // Cache the returned token if present
    const returnedToken = res.headers.get("x-payment-token");
    const tokenExpires = res.headers.get("x-payment-token-expires");
    if (returnedToken && tokenExpires) {
      setCachedToken(url, toolName, returnedToken, tokenExpires);
    }
  }

  return res;
}

// ─── Pay a challenge on Base ──────────────────────────────────────────────────

async function payChallenge(challenge: PaymentChallenge): Promise<string> {
  if (challenge.chainId !== 8453) {
    throw new Error(`Unsupported chain: ${challenge.chainId}. Only Base (8453) supported.`);
  }

  const { client, publicClient, account } = getWalletClient();

  const balance = await publicClient.getBalance({ address: account.address });
  const required = parseEther(challenge.price);
  const gasBuffer = BigInt(21000) * BigInt(2_000_000_000);

  if (balance < required + gasBuffer) {
    throw new Error(
      `Insufficient balance for payment. Need ${challenge.price} ETH + gas, have ${balance} wei.`,
    );
  }

  const hash = await client.sendTransaction({
    to: challenge.recipient as `0x${string}`,
    value: required,
    // Encode nonce as hex in data field for server verification
    data: `0x${Buffer.from(challenge.nonce).toString("hex")}` as `0x${string}`,
  });

  return hash;
}

// ─── Convenience: call an A2A tool with auto-payment ─────────────────────────

export async function callA2ATool(
  baseUrl: string,
  tool: string,
  args: Record<string, unknown>,
  fid = 0,
): Promise<unknown> {
  const url = `${baseUrl}/api/a2a`;
  const res = await paidFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool, args, fid }),
    toolName: tool,
    maxRetries: 2,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`A2A call failed (${res.status}): ${text}`);
  }

  const data = await res.json() as { result: unknown };
  return data.result;
}

// ─── Convenience: call an MCP tool with auto-payment ─────────────────────────

export async function callMCPTool(
  baseUrl: string,
  toolName: string,
  toolArgs: Record<string, unknown>,
): Promise<string> {
  const url = `${baseUrl}/api/mcp`;
  const res = await paidFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name: toolName, arguments: toolArgs },
    }),
    toolName,
    maxRetries: 2,
  });

  const data = await res.json() as {
    result?: { content?: Array<{ text?: string }> };
    error?: { message: string };
  };

  if (data.error) throw new Error(`MCP error: ${data.error.message}`);
  return data.result?.content?.[0]?.text ?? "";
}
