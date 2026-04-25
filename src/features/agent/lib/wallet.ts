/**
 * Server-side wallet using viem + WALLET_PRIVATE_KEY.
 * Executes real Base Mainnet transactions from the agent.
 *
 * SECURITY: This key is only used server-side (API routes / server actions).
 * It is NEVER exposed to the client.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  formatEther,
  formatUnits,
  parseUnits,
  isAddress,
  type Address,
} from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

// ─── Chain & RPC config ────────────────────────────────────────────────────────

const BASE_RPC = process.env.BASE_RPC_URL ?? "https://mainnet.base.org";

// USDC on Base Mainnet
const USDC_ADDRESS: Address = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_DECIMALS = 6;

// Minimal ERC-20 ABI for balance + transfer
const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

// ─── Client factory ────────────────────────────────────────────────────────────

export function getPublicClient() {
  return createPublicClient({ chain: base, transport: http(BASE_RPC) });
}

export function isWalletConfigured(): boolean {
  const key = process.env.WALLET_PRIVATE_KEY;
  return Boolean(key && key.startsWith("0x") && key.length === 66);
}

function getWalletClient() {
  const rawKey = process.env.WALLET_PRIVATE_KEY;
  if (!rawKey) throw new Error("WALLET_PRIVATE_KEY is not set.");
  if (!rawKey.startsWith("0x") || rawKey.length !== 66) {
    throw new Error("WALLET_PRIVATE_KEY must be a 32-byte hex string starting with 0x.");
  }
  const account = privateKeyToAccount(rawKey as `0x${string}`);
  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http(BASE_RPC),
  });
  return { walletClient, account };
}

// ─── Read: ETH + USDC balance ─────────────────────────────────────────────────

export interface WalletBalance {
  address: Address;
  ethBalance: string;       // human-readable, e.g. "0.012345"
  ethBalanceWei: string;    // raw wei string
  usdcBalance: string;      // human-readable, e.g. "10.50"
  usdcBalanceRaw: string;   // raw 6-decimal string
  network: string;
}

export async function getWalletBalance(address?: string): Promise<WalletBalance> {
  const publicClient = getPublicClient();

  // Resolve address: explicit arg → env wallet → error
  let resolvedAddress: Address;
  if (address && isAddress(address)) {
    resolvedAddress = address as Address;
  } else if (!address) {
    if (!isWalletConfigured()) {
      throw new Error("No address provided and WALLET_PRIVATE_KEY is not configured.");
    }
    const rawKey = process.env.WALLET_PRIVATE_KEY as `0x${string}`;
    resolvedAddress = privateKeyToAccount(rawKey).address;
  } else {
    throw new Error(`Invalid Ethereum address: ${address}`);
  }

  // Fetch ETH and USDC balances in parallel
  const [ethBalanceWei, usdcBalanceRaw] = await Promise.all([
    publicClient.getBalance({ address: resolvedAddress }),
    publicClient.readContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [resolvedAddress],
    }) as Promise<bigint>,
  ]);

  return {
    address: resolvedAddress,
    ethBalance: formatEther(ethBalanceWei),
    ethBalanceWei: ethBalanceWei.toString(),
    usdcBalance: formatUnits(usdcBalanceRaw, USDC_DECIMALS),
    usdcBalanceRaw: usdcBalanceRaw.toString(),
    network: "Base Mainnet",
  };
}

// ─── Write: send ETH ──────────────────────────────────────────────────────────

export interface SendEthResult {
  txHash: string;
  from: Address;
  to: Address;
  amountEth: string;
  amountWei: string;
  explorerUrl: string;
  status: "submitted";
}

/** Addresses the server wallet must NEVER send ETH to. */
const SEND_ETH_BLOCKLIST = new Set([
  // The payment recipient (our own server wallet) — no self-loops
  (process.env.NEYNAR_WALLET_ADDRESS ?? "0xd7e2341c4ca1de1c1f55a9514d8e720a60a9a87e").toLowerCase(),
]);

export async function sendEth(params: {
  to: string;
  amountEth: string;
}): Promise<SendEthResult> {
  if (!isAddress(params.to)) {
    throw new Error(`Invalid recipient address: ${params.to}`);
  }

  // Block sending to the server wallet itself or known blocked addresses
  if (SEND_ETH_BLOCKLIST.has(params.to.toLowerCase())) {
    throw new Error("Cannot send ETH to the server wallet address.");
  }

  const amountFloat = parseFloat(params.amountEth);
  if (isNaN(amountFloat) || amountFloat <= 0) {
    throw new Error("Amount must be a positive number.");
  }
  if (amountFloat > 0.1) {
    throw new Error("Safety limit: cannot send more than 0.1 ETH per tool call.");
  }

  const { walletClient, account } = getWalletClient();

  // Also block sending to the wallet's own signing address
  if (params.to.toLowerCase() === account.address.toLowerCase()) {
    throw new Error("Cannot send ETH to the wallet's own address.");
  }
  const publicClient = getPublicClient();

  const amountWei = parseEther(params.amountEth);

  // Pre-flight balance check
  const balance = await publicClient.getBalance({ address: account.address });
  // Rough gas estimate: 21000 * 2gwei
  const gasBuffer = BigInt(21000) * BigInt(2_000_000_000);
  if (balance < amountWei + gasBuffer) {
    const available = formatEther(balance);
    throw new Error(`Insufficient ETH. Balance: ${available} ETH, requested: ${params.amountEth} ETH + gas.`);
  }

  const hash = await walletClient.sendTransaction({
    to: params.to as Address,
    value: amountWei,
  });

  return {
    txHash: hash,
    from: account.address,
    to: params.to as Address,
    amountEth: params.amountEth,
    amountWei: amountWei.toString(),
    explorerUrl: `https://basescan.org/tx/${hash}`,
    status: "submitted",
  };
}

// ─── Read: recent transactions (via Basescan) ─────────────────────────────────

export async function getRecentTransactions(address?: string, limit = 5) {
  let resolvedAddress: string;

  if (address && isAddress(address)) {
    resolvedAddress = address;
  } else if (!address && isWalletConfigured()) {
    const rawKey = process.env.WALLET_PRIVATE_KEY as `0x${string}`;
    resolvedAddress = privateKeyToAccount(rawKey).address;
  } else {
    throw new Error("No valid address for transaction lookup.");
  }

  const apiKey = process.env.BASESCAN_API_KEY ?? "";
  const url = `https://api.basescan.org/api?module=account&action=txlist&address=${resolvedAddress}&startblock=0&endblock=99999999&page=1&offset=${limit}&sort=desc&apikey=${apiKey}`;

  try {
    const res = await fetch(url, { next: { revalidate: 60 } });
    const data = await res.json() as { status: string; result: Array<{
      hash: string;
      from: string;
      to: string;
      value: string;
      timeStamp: string;
      isError: string;
    }> };

    if (data.status !== "1" || !Array.isArray(data.result)) {
      return { address: resolvedAddress, transactions: [], note: "No transactions found or API unavailable." };
    }

    const txs = data.result.slice(0, limit).map((tx) => ({
      hash: tx.hash,
      from: tx.from,
      to: tx.to,
      valueEth: formatEther(BigInt(tx.value)),
      timestamp: new Date(parseInt(tx.timeStamp) * 1000).toISOString(),
      status: tx.isError === "0" ? "success" : "failed",
      explorerUrl: `https://basescan.org/tx/${tx.hash}`,
    }));

    return { address: resolvedAddress, transactions: txs };
  } catch {
    return { address: resolvedAddress, transactions: [], note: "Could not fetch transaction history." };
  }
}
