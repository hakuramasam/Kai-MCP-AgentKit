/**
 * Read any contract function on any EVM chain via Thirdweb SDK v5.
 * Supports human-readable ABI fragments — no full ABI needed.
 */

import { createThirdwebClient, getContract, readContract as twReadContract, resolveMethod } from "thirdweb";
import { base, mainnet, polygon, arbitrum, optimism } from "thirdweb/chains";

function getClient() {
  const clientId = process.env.THIRDWEB_CLIENT_ID;
  if (!clientId)
    throw new Error(
      "THIRDWEB_CLIENT_ID is not configured. Add it to .env — get a free key at thirdweb.com/dashboard",
    );
  return createThirdwebClient({ clientId });
}

const CHAIN_MAP: Record<number, typeof base> = {
  1: mainnet,
  8453: base,
  137: polygon,
  42161: arbitrum,
  10: optimism,
};

function resolveChain(chainId: number) {
  return CHAIN_MAP[chainId] ?? base;
}

// Chain name → id
const CHAIN_NAME_MAP: Record<string, number> = {
  base: 8453,
  ethereum: 1,
  eth: 1,
  mainnet: 1,
  polygon: 137,
  matic: 137,
  arbitrum: 42161,
  arb: 42161,
  optimism: 10,
  op: 10,
};

export function resolveChainId(chain: string | number): number {
  if (typeof chain === "number") return chain;
  const n = parseInt(chain, 10);
  if (!isNaN(n)) return n;
  return CHAIN_NAME_MAP[chain.toLowerCase()] ?? 8453;
}

export interface ContractReadResult {
  success: boolean;
  contractAddress?: string;
  chainId?: number;
  method?: string;
  result?: unknown;
  resultFormatted?: string;
  error?: string;
}

/**
 * Read a contract function using a human-readable ABI fragment.
 *
 * Example ABI fragment strings:
 *   "function name() view returns (string)"
 *   "function balanceOf(address) view returns (uint256)"
 *   "function ownerOf(uint256) view returns (address)"
 */
export async function readContractFunction(
  contractAddress: string,
  abiFragment: string,
  args: unknown[] = [],
  chain: string | number = 8453,
): Promise<ContractReadResult> {
  const chainId = resolveChainId(chain);

  try {
    const client = getClient();
    const thirdwebChain = resolveChain(chainId);

    const contract = getContract({
      client,
      chain: thirdwebChain,
      address: contractAddress,
    });

    // resolveMethod parses a human-readable ABI fragment into a PreparedMethod
    const method = await resolveMethod(abiFragment);

    const result = await twReadContract({
      contract,
      method,
      params: args,
    });

    // Format bigints and arrays for JSON serialization
    const formatted = formatResult(result);

    return {
      success: true,
      contractAddress,
      chainId,
      method: abiFragment,
      result: formatted,
      resultFormatted: JSON.stringify(formatted, null, 2),
    };
  } catch (err) {
    return {
      success: false,
      contractAddress,
      chainId,
      method: abiFragment,
      error: `Contract read failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** Recursively serialize BigInts and special types for JSON */
function formatResult(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(formatResult);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = formatResult(v);
    }
    return out;
  }
  return value;
}

/** Common ERC-20 ABI fragments for convenience */
export const ERC20_FRAGMENTS = {
  name: "function name() view returns (string)",
  symbol: "function symbol() view returns (string)",
  decimals: "function decimals() view returns (uint8)",
  totalSupply: "function totalSupply() view returns (uint256)",
  balanceOf: "function balanceOf(address account) view returns (uint256)",
};

/** Common ERC-721 ABI fragments */
export const ERC721_FRAGMENTS = {
  name: "function name() view returns (string)",
  symbol: "function symbol() view returns (string)",
  totalSupply: "function totalSupply() view returns (uint256)",
  ownerOf: "function ownerOf(uint256 tokenId) view returns (address)",
  tokenURI: "function tokenURI(uint256 tokenId) view returns (string)",
  balanceOf: "function balanceOf(address owner) view returns (uint256)",
};
