/**
 * Token gating — on-chain balance checks via viem public client.
 * No private key needed — read-only RPC calls only.
 *
 * Supports:
 *   - ERC-20: balanceOf(address) >= minBalance
 *   - ERC-721: balanceOf(address) >= 1
 *   - ERC-1155: balanceOf(address, tokenId) >= minBalance
 */

import { createPublicClient, http, parseAbi } from "viem";
import { base, mainnet, polygon, arbitrum, optimism } from "viem/chains";

// ─── Chain setup ──────────────────────────────────────────────────────────────

const CHAINS = {
  1:     { chain: mainnet,   rpc: "https://cloudflare-eth.com" },
  8453:  { chain: base,      rpc: process.env.BASE_RPC_URL ?? "https://mainnet.base.org" },
  137:   { chain: polygon,   rpc: "https://polygon-rpc.com" },
  42161: { chain: arbitrum,  rpc: "https://arb1.arbitrum.io/rpc" },
  10:    { chain: optimism,  rpc: "https://mainnet.optimism.io" },
} as const;

function getClient(chainId: number) {
  const cfg = CHAINS[chainId as keyof typeof CHAINS] ?? CHAINS[8453];
  return createPublicClient({ chain: cfg.chain, transport: http(cfg.rpc) });
}

// ─── ABIs ─────────────────────────────────────────────────────────────────────

const ERC20_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
]);

const ERC721_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
]);

const ERC1155_ABI = parseAbi([
  "function balanceOf(address account, uint256 id) view returns (uint256)",
]);

// ─── Types ────────────────────────────────────────────────────────────────────

export type TokenType = "ERC-20" | "ERC-721" | "ERC-1155";

export interface GateConfig {
  contractAddress: string;
  tokenType: TokenType;
  /** ERC-1155 only: which token ID to check */
  tokenId?: number;
  /** Minimum balance required. Defaults to 1. For ERC-20, this is in raw decimal units (e.g. "1.5" for 1.5 tokens) */
  minBalance?: string;
  chainId?: number;
}

export interface GateCheckResult {
  allowed: boolean;
  tokenType: TokenType;
  contractAddress: string;
  walletAddress: string;
  chainId: number;
  balance: string;
  /** Human-readable balance (accounts for ERC-20 decimals) */
  balanceFormatted: string;
  minRequired: string;
  /** Collection/token name if readable */
  tokenName?: string;
  tokenSymbol?: string;
  error?: string;
}

// ─── Core checker ─────────────────────────────────────────────────────────────

export async function checkTokenGate(
  walletAddress: string,
  config: GateConfig,
): Promise<GateCheckResult> {
  const chainId = config.chainId ?? 8453;
  const contractAddress = config.contractAddress as `0x${string}`;
  const minBalanceStr = config.minBalance ?? "1";
  const client = getClient(chainId);

  const base: Omit<GateCheckResult, "allowed" | "balance" | "balanceFormatted" | "minRequired"> = {
    tokenType: config.tokenType,
    contractAddress: config.contractAddress,
    walletAddress,
    chainId,
  };

  try {
    if (config.tokenType === "ERC-721") {
      const [rawBalance, name, symbol] = await Promise.allSettled([
        client.readContract({ address: contractAddress, abi: ERC721_ABI, functionName: "balanceOf", args: [walletAddress as `0x${string}`] }),
        client.readContract({ address: contractAddress, abi: ERC721_ABI, functionName: "name" }),
        client.readContract({ address: contractAddress, abi: ERC721_ABI, functionName: "symbol" }),
      ]);

      const balance = rawBalance.status === "fulfilled" ? (rawBalance.value as bigint) : 0n;
      const balanceNum = Number(balance);
      const minNum = parseFloat(minBalanceStr);

      return {
        ...base,
        allowed: balanceNum >= minNum,
        balance: balance.toString(),
        balanceFormatted: balanceNum.toString(),
        minRequired: minBalanceStr,
        tokenName: name.status === "fulfilled" ? (name.value as string) : undefined,
        tokenSymbol: symbol.status === "fulfilled" ? (symbol.value as string) : undefined,
      };
    }

    if (config.tokenType === "ERC-1155") {
      const tokenId = BigInt(config.tokenId ?? 0);
      const rawBalance = await client.readContract({
        address: contractAddress,
        abi: ERC1155_ABI,
        functionName: "balanceOf",
        args: [walletAddress as `0x${string}`, tokenId],
      }) as bigint;

      const balanceNum = Number(rawBalance);
      const minNum = parseFloat(minBalanceStr);

      return {
        ...base,
        allowed: balanceNum >= minNum,
        balance: rawBalance.toString(),
        balanceFormatted: balanceNum.toString(),
        minRequired: minBalanceStr,
      };
    }

    // ERC-20
    const [rawBalance, decimals, name, symbol] = await Promise.allSettled([
      client.readContract({ address: contractAddress, abi: ERC20_ABI, functionName: "balanceOf", args: [walletAddress as `0x${string}`] }),
      client.readContract({ address: contractAddress, abi: ERC20_ABI, functionName: "decimals" }),
      client.readContract({ address: contractAddress, abi: ERC20_ABI, functionName: "name" }),
      client.readContract({ address: contractAddress, abi: ERC20_ABI, functionName: "symbol" }),
    ]);

    const balance = rawBalance.status === "fulfilled" ? (rawBalance.value as bigint) : 0n;
    const dec = decimals.status === "fulfilled" ? Number(decimals.value as number) : 18;
    const balanceFormatted = (Number(balance) / Math.pow(10, dec)).toString();
    const minNum = parseFloat(minBalanceStr);

    return {
      ...base,
      allowed: parseFloat(balanceFormatted) >= minNum,
      balance: balance.toString(),
      balanceFormatted,
      minRequired: minBalanceStr,
      tokenName: name.status === "fulfilled" ? (name.value as string) : undefined,
      tokenSymbol: symbol.status === "fulfilled" ? (symbol.value as string) : undefined,
    };
  } catch (err) {
    return {
      ...base,
      allowed: false,
      balance: "0",
      balanceFormatted: "0",
      minRequired: minBalanceStr,
      error: `Gate check failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── Multi-gate: require ANY or ALL ──────────────────────────────────────────

export type GateMode = "any" | "all";

export interface MultiGateResult {
  allowed: boolean;
  mode: GateMode;
  gates: GateCheckResult[];
  passedCount: number;
  totalCount: number;
}

export async function checkMultipleGates(
  walletAddress: string,
  configs: GateConfig[],
  mode: GateMode = "any",
): Promise<MultiGateResult> {
  const gates = await Promise.all(
    configs.map((cfg) => checkTokenGate(walletAddress, cfg)),
  );
  const passedCount = gates.filter((g) => g.allowed).length;
  const allowed = mode === "any" ? passedCount > 0 : passedCount === gates.length;

  return { allowed, mode, gates, passedCount, totalCount: gates.length };
}
