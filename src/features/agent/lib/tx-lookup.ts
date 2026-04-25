/**
 * Base Mainnet transaction lookup via viem + Basescan API.
 * Fetches full details for a single transaction hash.
 */

import { createPublicClient, http, formatEther, type Hash } from "viem";
import { base } from "viem/chains";

const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL ?? "https://mainnet.base.org"),
});

export interface TxDetails {
  hash: string;
  status: "success" | "reverted" | "pending";
  from: string;
  to: string | null;
  value: string;        // ETH as decimal string
  valueWei: string;
  gasUsed: string;
  gasPrice: string;     // gwei
  blockNumber: number | null;
  blockTimestamp: string | null;  // ISO
  nonce: number;
  inputData: string;    // first 100 chars of calldata (hex)
  isContractInteraction: boolean;
  basescanUrl: string;
  network: "base";
  chainId: 8453;
}

export interface TxLookupResult {
  success: boolean;
  data?: TxDetails;
  error?: string;
}

export async function lookupTransaction(txHash: string): Promise<TxLookupResult> {
  const trimmed = txHash.trim();

  if (!trimmed.startsWith("0x") || trimmed.length !== 66) {
    return {
      success: false,
      error: "Invalid transaction hash. Must be a 66-character hex string starting with 0x.",
    };
  }

  try {
    const hash = trimmed as Hash;

    // Fetch tx and receipt in parallel
    const [tx, receipt] = await Promise.all([
      publicClient.getTransaction({ hash }).catch(() => null),
      publicClient.getTransactionReceipt({ hash }).catch(() => null),
    ]);

    // Tx not found on-chain yet
    if (!tx) {
      return {
        success: false,
        error: `Transaction ${trimmed} not found on Base Mainnet. It may be pending or the hash may be incorrect.`,
      };
    }

    // Get block timestamp if mined
    let blockTimestamp: string | null = null;
    if (receipt?.blockNumber) {
      try {
        const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber });
        blockTimestamp = new Date(Number(block.timestamp) * 1000).toISOString();
      } catch {
        // Non-fatal
      }
    }

    const status = receipt
      ? receipt.status === "success"
        ? "success"
        : "reverted"
      : "pending";

    const gasUsed = receipt?.gasUsed ? receipt.gasUsed.toString() : "pending";
    const gasPriceGwei = tx.gasPrice
      ? (Number(tx.gasPrice) / 1e9).toFixed(4)
      : "0";

    const inputPreview =
      tx.input && tx.input.length > 2
        ? tx.input.slice(0, 102) + (tx.input.length > 102 ? "…" : "")
        : "0x";

    return {
      success: true,
      data: {
        hash: trimmed,
        status,
        from: tx.from,
        to: tx.to ?? null,
        value: formatEther(tx.value),
        valueWei: tx.value.toString(),
        gasUsed,
        gasPrice: `${gasPriceGwei} gwei`,
        blockNumber: receipt?.blockNumber ? Number(receipt.blockNumber) : null,
        blockTimestamp,
        nonce: tx.nonce,
        inputData: inputPreview,
        isContractInteraction: tx.input !== "0x" && tx.input !== "",
        basescanUrl: `https://basescan.org/tx/${trimmed}`,
        network: "base",
        chainId: 8453,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: `Lookup failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
