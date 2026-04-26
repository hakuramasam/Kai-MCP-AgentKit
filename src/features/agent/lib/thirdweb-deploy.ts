/**
 * Thirdweb contract deployment using native SDK v5 functions.
 *
 * Uses deployERC20Contract, deployERC721Contract, deployERC1155Contract from
 * thirdweb/deploys — no Nebula AI intermediary for standard token types.
 *
 * For custom contracts, falls back to Nebula AI + viem broadcast path.
 *
 * Flow:
 *   1. Parse contractType from description
 *   2. Use native deployERC*Contract with thirdweb privateKeyToAccount
 *   3. Return tx hash, deployed contract address, gas cost, dashboard link
 */

import { createThirdwebClient } from "thirdweb";
import { base } from "thirdweb/chains";
import { privateKeyToAccount } from "thirdweb/wallets";
import {
  deployERC20Contract,
  deployERC721Contract,
  deployERC1155Contract,
} from "thirdweb/deploys";
import {
  createWalletClient,
  createPublicClient,
  http,
  formatEther,
  type Hex,
  type Address,
} from "viem";
import { base as viemBase } from "viem/chains";
import { privateKeyToAccount as viemPrivateKeyToAccount } from "viem/accounts";

const NEBULA_BASE = "https://nebula-api.thirdweb.com";
const BASE_RPC    = process.env.BASE_RPC_URL ?? "https://mainnet.base.org";

// ─── Client factory ────────────────────────────────────────────────────────────

function getThirdwebClient() {
  const clientId = process.env.THIRDWEB_CLIENT_ID;
  if (!clientId) throw new Error("THIRDWEB_CLIENT_ID is not configured. Get a free key at thirdweb.com/dashboard");
  return createThirdwebClient({ clientId });
}

function getThirdwebAccount() {
  const rawKey = process.env.WALLET_PRIVATE_KEY;
  if (!rawKey?.startsWith("0x") || rawKey.length !== 66) return null;
  const client = getThirdwebClient();
  return privateKeyToAccount({ privateKey: rawKey as `0x${string}`, client });
}

function getViemWallet() {
  const rawKey = process.env.WALLET_PRIVATE_KEY;
  if (!rawKey?.startsWith("0x") || rawKey.length !== 66) return null;
  const account      = viemPrivateKeyToAccount(rawKey as `0x${string}`);
  const walletClient = createWalletClient({ account, chain: viemBase, transport: http(BASE_RPC) });
  const publicClient = createPublicClient({ chain: viemBase, transport: http(BASE_RPC) });
  return { account, walletClient, publicClient };
}

// ─── Result type ───────────────────────────────────────────────────────────────

export interface DeployResult {
  success: boolean;
  /** Human-readable answer or summary */
  message?: string;
  /** Whether the contract was broadcast on-chain automatically */
  deployed: boolean;
  /** On-chain deployment transaction hash */
  txHash?: string;
  /** Deployed contract address */
  contractAddress?: string;
  /** ETH spent on gas */
  gasCost?: string;
  /** Thirdweb dashboard link */
  dashboardUrl?: string;
  /** Basescan tx link */
  explorerUrl?: string;
  /** Raw Nebula actions (custom contract path only) */
  actions?: Array<{ type: string; data: unknown }>;
  error?: string;
}

// ─── Main deploy entry point ───────────────────────────────────────────────────

export async function deployContract(params: {
  description: string;
  contractType?: string;
  name?: string;
  symbol?: string;
  chainId?: number;
  walletAddress?: string;
  extraParams?: string;
}): Promise<DeployResult> {
  const chainId = params.chainId ?? 8453;

  // Determine which path to use
  const type = params.contractType?.toUpperCase() ?? inferContractType(params.description);

  if (type === "ERC-20" || type === "ERC20") {
    return deployNativeERC20(params);
  }
  if (type === "ERC-721" || type === "ERC721") {
    return deployNativeERC721(params);
  }
  if (type === "ERC-1155" || type === "ERC1155") {
    return deployNativeERC1155(params);
  }

  // Custom contract — use Nebula AI + viem broadcast
  return deployWithNebula(params, chainId);
}

// ─── Infer contract type from description ─────────────────────────────────────

function inferContractType(description: string): string {
  const lower = description.toLowerCase();
  if (lower.includes("erc-20") || lower.includes("erc20") || lower.includes("token") || lower.includes("fungible")) return "ERC-20";
  if (lower.includes("erc-1155") || lower.includes("erc1155") || lower.includes("multi-token") || lower.includes("semi-fungible")) return "ERC-1155";
  if (lower.includes("erc-721") || lower.includes("erc721") || lower.includes("nft") || lower.includes("collection") || lower.includes("non-fungible")) return "ERC-721";
  return "custom";
}

// ─── Native ERC-20 deploy ──────────────────────────────────────────────────────

async function deployNativeERC20(params: {
  name?: string;
  symbol?: string;
  description: string;
  extraParams?: string;
}): Promise<DeployResult> {
  try {
    const account = getThirdwebAccount();
    if (!account) {
      return {
        success: false,
        deployed: false,
        error: "WALLET_PRIVATE_KEY is not configured. Add it to .env to enable automated deployment.",
        dashboardUrl: "https://thirdweb.com/dashboard/contracts/deploy",
      };
    }

    const client = getThirdwebClient();
    const name   = params.name ?? extractName(params.description) ?? "MyToken";
    const symbol = params.symbol ?? extractSymbol(params.description) ?? "MTK";

    const contractAddress = await deployERC20Contract({
      chain: base,
      client,
      account,
      type: "TokenERC20",
      params: {
        name,
        symbol,
        description: params.description,
        primarySaleRecipient: (account as { address: string }).address,
      },
    });

    const dashboardUrl = `https://thirdweb.com/8453/${contractAddress}`;
    return {
      success: true,
      deployed: true,
      message: `ERC-20 token "${name}" (${symbol}) deployed successfully on Base Mainnet.`,
      contractAddress,
      dashboardUrl,
      explorerUrl: `https://basescan.org/address/${contractAddress}`,
    };
  } catch (err) {
    return {
      success: false,
      deployed: false,
      error: `ERC-20 deployment failed: ${err instanceof Error ? err.message : String(err)}`,
      dashboardUrl: "https://thirdweb.com/dashboard/contracts/deploy",
    };
  }
}

// ─── Native ERC-721 deploy ────────────────────────────────────────────────────

async function deployNativeERC721(params: {
  name?: string;
  symbol?: string;
  description: string;
  extraParams?: string;
}): Promise<DeployResult> {
  try {
    const account = getThirdwebAccount();
    if (!account) {
      return {
        success: false,
        deployed: false,
        error: "WALLET_PRIVATE_KEY is not configured. Add it to .env to enable automated deployment.",
        dashboardUrl: "https://thirdweb.com/dashboard/contracts/deploy",
      };
    }

    const client = getThirdwebClient();
    const name   = params.name ?? extractName(params.description) ?? "MyNFT";
    const symbol = params.symbol ?? extractSymbol(params.description) ?? "NFT";

    const contractAddress = await deployERC721Contract({
      chain: base,
      client,
      account,
      type: "TokenERC721",
      params: {
        name,
        symbol,
        description: params.description,
        primarySaleRecipient: (account as { address: string }).address,
      },
    });

    const dashboardUrl = `https://thirdweb.com/8453/${contractAddress}`;
    return {
      success: true,
      deployed: true,
      message: `ERC-721 NFT collection "${name}" (${symbol}) deployed on Base Mainnet.`,
      contractAddress,
      dashboardUrl,
      explorerUrl: `https://basescan.org/address/${contractAddress}`,
    };
  } catch (err) {
    return {
      success: false,
      deployed: false,
      error: `ERC-721 deployment failed: ${err instanceof Error ? err.message : String(err)}`,
      dashboardUrl: "https://thirdweb.com/dashboard/contracts/deploy",
    };
  }
}

// ─── Native ERC-1155 deploy ───────────────────────────────────────────────────

async function deployNativeERC1155(params: {
  name?: string;
  symbol?: string;
  description: string;
  extraParams?: string;
}): Promise<DeployResult> {
  try {
    const account = getThirdwebAccount();
    if (!account) {
      return {
        success: false,
        deployed: false,
        error: "WALLET_PRIVATE_KEY is not configured. Add it to .env to enable automated deployment.",
        dashboardUrl: "https://thirdweb.com/dashboard/contracts/deploy",
      };
    }

    const client = getThirdwebClient();
    const name   = params.name ?? extractName(params.description) ?? "MyMultiToken";
    const symbol = params.symbol ?? extractSymbol(params.description) ?? "MTT";

    const contractAddress = await deployERC1155Contract({
      chain: base,
      client,
      account,
      type: "TokenERC1155",
      params: {
        name,
        symbol,
        description: params.description,
        primarySaleRecipient: (account as { address: string }).address,
      },
    });

    const dashboardUrl = `https://thirdweb.com/8453/${contractAddress}`;
    return {
      success: true,
      deployed: true,
      message: `ERC-1155 multi-token contract "${name}" (${symbol}) deployed on Base Mainnet.`,
      contractAddress,
      dashboardUrl,
      explorerUrl: `https://basescan.org/address/${contractAddress}`,
    };
  } catch (err) {
    return {
      success: false,
      deployed: false,
      error: `ERC-1155 deployment failed: ${err instanceof Error ? err.message : String(err)}`,
      dashboardUrl: "https://thirdweb.com/dashboard/contracts/deploy",
    };
  }
}

// ─── Nebula AI path for custom contracts ────────────────────────────────────────

async function deployWithNebula(params: {
  description: string;
  contractType?: string;
  name?: string;
  symbol?: string;
  chainId?: number;
  walletAddress?: string;
  extraParams?: string;
}, chainId: number): Promise<DeployResult> {
  const secretKey = process.env.THIRDWEB_SECRET_KEY;
  if (!secretKey) {
    return {
      success: false,
      deployed: false,
      error: "THIRDWEB_SECRET_KEY is not configured. Get a free key at thirdweb.com/dashboard.",
    };
  }

  const wallet    = getViemWallet();
  const chainName = chainId === 8453 ? "Base Mainnet" : `chain ${chainId}`;
  const deployerAddress = wallet?.account.address ?? params.walletAddress;

  const prompt = [
    `Deploy a ${params.contractType ?? "smart contract"} on ${chainName}.`,
    `Description: ${params.description}`,
    params.name   ? `Token name: ${params.name}`     : null,
    params.symbol ? `Token symbol: ${params.symbol}` : null,
    params.extraParams ?? null,
    deployerAddress ? `Deployer wallet: ${deployerAddress}` : null,
    "Return the complete deployment transaction in your actions array with fields: to, data, value.",
    "Include constructor parameters, estimated gas cost, and a brief explanation.",
  ].filter(Boolean).join(" ");

  // Ask Nebula
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
          chain_ids: [String(chainId)],
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

  // Extract tx payload from Nebula actions
  interface TxPayload { to?: string; data?: string; value?: string }
  let txPayload: TxPayload | null = null;

  for (const action of nebulaActions) {
    const d = action.data ?? {};
    if (d.to && (d.data || d.input)) {
      txPayload = {
        to:    String(d.to),
        data:  String(d.data ?? d.input ?? "0x"),
        value: d.value ? String(d.value) : "0",
      };
      break;
    }
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

  // Auto-broadcast if wallet is configured
  if (wallet && txPayload?.to) {
    try {
      const { account, walletClient, publicClient } = wallet;
      const balance = await publicClient.getBalance({ address: account.address });
      const valueWei = txPayload.value && txPayload.value !== "0" ? BigInt(txPayload.value) : BigInt(0);
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

      const txHash = await walletClient.sendTransaction({
        to:    txPayload.to as Address,
        data:  (txPayload.data ?? "0x") as Hex,
        value: valueWei,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 60_000 });
      const contractAddress = receipt.contractAddress ?? undefined;
      const gasCost = formatEther(receipt.gasUsed * (receipt.effectiveGasPrice ?? BigInt(0)));

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

  // No wallet — return guide only
  return {
    success:      true,
    deployed:     false,
    message:      nebulaMessage,
    actions:      nebulaActions,
    dashboardUrl: "https://thirdweb.com/dashboard/contracts/deploy",
    error: wallet === null
      ? "WALLET_PRIVATE_KEY is not configured — add it to .env to enable automated on-chain deployment."
      : undefined,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractName(description: string): string | null {
  // "called X" or "named X" pattern
  const m = description.match(/(?:called|named)\s+"?([A-Za-z0-9 ]+)"?/i);
  return m ? m[1].trim() : null;
}

function extractSymbol(description: string): string | null {
  // "symbol X" or "(X)" or "ticker X"
  const m = description.match(/(?:symbol|ticker)\s+([A-Z]{2,8})/i)
    ?? description.match(/\(([A-Z]{2,8})\)/);
  return m ? m[1].toUpperCase() : null;
}
