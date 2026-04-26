/**
 * Thirdweb contract deployment via Nebula AI + server wallet.
 *
 * Flow:
 *   1. Send deployment description to Nebula AI — it returns the
 *      deployment transaction (to, data, value) in its actions array.
 *   2. Sign + broadcast the tx with the server wallet (WALLET_PRIVATE_KEY via viem).
 *   3. Wait for the receipt and extract the deployed contract address.
 *   4. Return the tx hash, contract address, and Thirdweb dashboard link.
 *
 * If WALLET_PRIVATE_KEY is not set, falls back to returning Nebula's
 * deployment guide only (manual deploy via Thirdweb dashboard).
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  parseEther,
  formatEther,
  type Hex,
  type Address,
} from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const NEBULA_BASE = "https://nebula-api.thirdweb.com";
const BASE_RPC    = process.env.BASE_RPC_URL ?? "https://mainnet.base.org";

function getDeployWallet() {
  const rawKey = process.env.WALLET_PRIVATE_KEY;
  if (!rawKey?.startsWith("0x") || rawKey.length !== 66) return null;
  const account      = privateKeyToAccount(rawKey as `0x${string}`);
  const walletClient = createWalletClient({ account, chain: base, transport: http(BASE_RPC) });
  const publicClient = createPublicClient({ chain: base, transport: http(BASE_RPC) });
  return { account, walletClient, publicClient };
}

export interface DeployResult {
  success: boolean;
  /** Human-readable answer from Nebula (deployment steps, ABI notes, etc.) */
  message?: string;
  /** Whether the tx was broadcast on-chain automatically */
  deployed: boolean;
  /** On-chain deployment transaction hash */
  txHash?: string;
  /** Deployed contract address (from receipt logs) */
  contractAddress?: string;
  /** ETH spent on gas */
  gasCost?: string;
  /** Thirdweb dashboard link */
  dashboardUrl?: string;
  /** Basescan tx link */
  explorerUrl?: string;
  /** Raw Nebula actions (for advanced callers) */
  actions?: Array<{ type: string; data: unknown }>;
  error?: string;
}

/**
 * Deploy a smart contract on Base using Thirdweb Nebula AI + server wallet.
 *
 * Steps:
 *   1. Ask Nebula to produce a deploy transaction for the described contract.
 *   2. Extract the tx payload from Nebula's actions array.
 *   3. If WALLET_PRIVATE_KEY is set: sign + broadcast on-chain automatically,
 *      wait for the receipt, and return the deployed contract address.
 *   4. If not set: return Nebula's deployment guide for manual deploy.
 */
export async function deployContract(params: {
  description: string;
  contractType?: string;
  name?: string;
  symbol?: string;
  chainId?: number;
  walletAddress?: string;
  extraParams?: string;
}): Promise<DeployResult> {
  const secretKey = process.env.THIRDWEB_SECRET_KEY;
  if (!secretKey) {
    return {
      success: false,
      deployed: false,
      error: "THIRDWEB_SECRET_KEY is not configured. Get a free key at thirdweb.com/dashboard.",
    };
  }

  const chainId    = params.chainId ?? 8453;
  const chainName  = chainId === 8453 ? "Base Mainnet" : `chain ${chainId}`;
  const wallet     = getDeployWallet();

  // If we have a wallet, tell Nebula which address will deploy (better gas estimates)
  const deployerAddress = wallet?.account.address ?? params.walletAddress;
  const contractType    = params.contractType ?? "smart contract";

  const prompt = [
    `Deploy a ${contractType} on ${chainName}.`,
    `Description: ${params.description}`,
    params.name    ? `Token name: ${params.name}`     : null,
    params.symbol  ? `Token symbol: ${params.symbol}` : null,
    params.extraParams ?? null,
    deployerAddress ? `Deployer wallet: ${deployerAddress}` : null,
    "Return the complete deployment transaction in your actions array with fields: to, data, value.",
    "Include constructor parameters, estimated gas cost, and a brief explanation.",
  ].filter(Boolean).join(" ");

  // ── Step 1: Ask Nebula ─────────────────────────────────────────────────────
  let nebulaMessage = "";
  let nebulaActions: Array<{ type: string; data: Record<string, unknown> }> = [];

  try {
    const res = await fetch(`${NEBULA_BASE}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-secret-key": secretKey },
      body: JSON.stringify({
        message: prompt,
        stream: false,
        context: {
          chain_ids:      [String(chainId)],
          ...(deployerAddress ? { wallet_address: deployerAddress } : {}),
        },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { success: false, deployed: false, error: `Nebula error ${res.status}: ${text.slice(0, 300)}` };
    }

    const data = await res.json() as {
      message?: string;
      actions?: Array<{ type: string; data: Record<string, unknown> }>;
    };
    nebulaMessage = data.message ?? "";
    nebulaActions = data.actions ?? [];
  } catch (err) {
    return {
      success: false,
      deployed: false,
      error: `Nebula request failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // ── Step 2: Extract tx payload from Nebula actions ─────────────────────────
  interface TxPayload { to?: string; data?: string; value?: string }
  let txPayload: TxPayload | null = null;

  for (const action of nebulaActions) {
    const d = action.data ?? {};
    // Nebula may return a "transaction" action with to/data/value
    if (d.to && (d.data || d.input)) {
      txPayload = {
        to:    String(d.to),
        data:  String(d.data ?? d.input ?? "0x"),
        value: d.value ? String(d.value) : "0",
      };
      break;
    }
    // Or it may nest the tx under a "transaction" key
    if (d.transaction && typeof d.transaction === "object") {
      const tx = d.transaction as Record<string, unknown>;
      if (tx.to) {
        txPayload = {
          to:    String(tx.to),
          data:  String(tx.data ?? tx.input ?? "0x"),
          value: tx.value ? String(tx.value) : "0",
        };
        break;
      }
    }
  }

  // ── Step 3a: Auto-broadcast if wallet is configured ────────────────────────
  if (wallet && txPayload?.to) {
    try {
      // Pre-flight: check balance
      const { account, walletClient, publicClient } = wallet;
      const balance = await publicClient.getBalance({ address: account.address });
      const valueWei = txPayload.value && txPayload.value !== "0"
        ? BigInt(txPayload.value)
        : BigInt(0);
      // Conservative gas buffer: 3M gas * 2 gwei (covers most contract deploys)
      const gasBuffer = BigInt(3_000_000) * BigInt(2_000_000_000);

      if (balance < valueWei + gasBuffer) {
        const have = formatEther(balance);
        return {
          success: false,
          deployed: false,
          message: nebulaMessage,
          error: `Insufficient ETH for deployment. Wallet has ${have} ETH — please fund ${account.address} on Base and retry.`,
          dashboardUrl: "https://thirdweb.com/dashboard/contracts/deploy",
        };
      }

      // Broadcast
      const txHash = await walletClient.sendTransaction({
        to:   txPayload.to as Address,
        data: (txPayload.data ?? "0x") as Hex,
        value: valueWei,
      });

      // Wait for receipt (up to 60s)
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
        timeout: 60_000,
      });

      // Contract address is in receipt.contractAddress for CREATE txs
      const contractAddress = receipt.contractAddress ?? undefined;
      const gasUsed  = receipt.gasUsed;
      const gasPrice = receipt.effectiveGasPrice ?? BigInt(0);
      const gasCost  = formatEther(gasUsed * gasPrice);

      const dashboardUrl = contractAddress
        ? `https://thirdweb.com/${chainId}/${contractAddress}`
        : `https://basescan.org/tx/${txHash}`;

      return {
        success:         true,
        deployed:        true,
        message:         nebulaMessage,
        txHash,
        contractAddress,
        gasCost:         `${gasCost} ETH`,
        dashboardUrl,
        explorerUrl:     `https://basescan.org/tx/${txHash}`,
        actions:         nebulaActions,
      };
    } catch (err) {
      // Broadcast failed — still return Nebula's guide so the user isn't left empty-handed
      return {
        success:  true,
        deployed: false,
        message:  nebulaMessage,
        actions:  nebulaActions,
        error:    `On-chain broadcast failed: ${err instanceof Error ? err.message : String(err)}. Use the Thirdweb dashboard to deploy manually.`,
        dashboardUrl: "https://thirdweb.com/dashboard/contracts/deploy",
      };
    }
  }

  // ── Step 3b: No wallet — return Nebula's guide only ────────────────────────
  // Extract any addresses/hashes Nebula already included in actions
  let contractAddress: string | undefined;
  let txHash: string | undefined;
  for (const action of nebulaActions) {
    const d = action.data ?? {};
    if (typeof d.contract_address === "string") contractAddress = d.contract_address;
    if (typeof d.transaction_hash === "string") txHash = d.transaction_hash;
  }

  return {
    success:         true,
    deployed:        false,
    message:         nebulaMessage,
    txHash,
    contractAddress,
    actions:         nebulaActions,
    dashboardUrl:    "https://thirdweb.com/dashboard/contracts/deploy",
    error: wallet === null
      ? "WALLET_PRIVATE_KEY is not configured — add it to .env to enable automated on-chain deployment. Nebula deployment guide is above."
      : undefined,
  };
}
