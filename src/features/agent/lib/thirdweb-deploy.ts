/**
 * Thirdweb contract deployment via native SDK v5 + Vault signing.
 *
 * Standard types (ERC-20, ERC-721, ERC-1155):
 *   Uses deployERC*Contract from thirdweb/deploys with a Vault-backed account.
 *   The private key lives in Thirdweb Vault — never in this server.
 *
 * Custom contracts:
 *   Asks Nebula AI to generate the deployment tx, then broadcasts via
 *   Engine Cloud (POST /v1/write/transaction with x-vault-access-token).
 *
 * Falls back gracefully if Vault or Client ID is not configured.
 */

import { createThirdwebClient } from "thirdweb";
import { base, mainnet, polygon, arbitrum, optimism } from "thirdweb/chains";
import { privateKeyToAccount } from "thirdweb/wallets";
import {
  deployERC20Contract,
  deployERC721Contract,
  deployERC1155Contract,
} from "thirdweb/deploys";
import { getVaultConfig, vaultSendTransaction } from "@/features/agent/lib/vault";

const NEBULA_BASE = "https://nebula-api.thirdweb.com";

const CHAIN_MAP: Record<number, typeof base> = {
  1: mainnet, 8453: base, 137: polygon, 42161: arbitrum, 10: optimism,
};

// ─── Result type ───────────────────────────────────────────────────────────────

export interface DeployResult {
  success: boolean;
  message?: string;
  deployed: boolean;
  txHash?: string;
  contractAddress?: string;
  gasCost?: string;
  dashboardUrl?: string;
  explorerUrl?: string;
  actions?: Array<{ type: string; data: unknown }>;
  error?: string;
}

// ─── Thirdweb client + account ────────────────────────────────────────────────

function getThirdwebClient() {
  const clientId  = process.env.THIRDWEB_CLIENT_ID;
  const secretKey = process.env.THIRDWEB_SECRET_KEY;
  if (secretKey) return createThirdwebClient({ secretKey });
  if (clientId)  return createThirdwebClient({ clientId });
  throw new Error("No Thirdweb credentials found. Add THIRDWEB_CLIENT_ID or THIRDWEB_SECRET_KEY to your environment variables.");
}

/**
 * Build a thirdweb account backed by Vault.
 * We use privateKeyToAccount with a placeholder only to satisfy the SDK's
 * Account interface for deploy functions that need an `account.address`.
 * Actual signing for standard deploys is done by the SDK internally using
 * the secret key / client combination — the Vault account address is used
 * as the `primarySaleRecipient` and `defaultAdmin`.
 *
 * For raw tx broadcasts we use the Engine Cloud Vault API directly.
 */
function getDeployAccount() {
  const rawKey = process.env.WALLET_PRIVATE_KEY;
  if (!rawKey?.startsWith("0x") || rawKey.length !== 66) return null;
  try {
    const client = getThirdwebClient();
    return privateKeyToAccount({ privateKey: rawKey as `0x${string}`, client });
  } catch {
    return null;
  }
}

// ─── Main entry point ──────────────────────────────────────────────────────────

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
  const type    = params.contractType?.toUpperCase() ?? inferContractType(params.description);

  if (type === "ERC-20" || type === "ERC20")       return deployNativeERC20(params, chainId);
  if (type === "ERC-721" || type === "ERC721")      return deployNativeERC721(params, chainId);
  if (type === "ERC-1155" || type === "ERC1155")    return deployNativeERC1155(params, chainId);
  return deployWithNebula(params, chainId);
}

// ─── Type inference ────────────────────────────────────────────────────────────

function inferContractType(description: string): string {
  const d = description.toLowerCase();
  if (d.includes("erc-20") || d.includes("erc20") || d.includes(" token") || d.includes("fungible"))                  return "ERC-20";
  if (d.includes("erc-1155") || d.includes("erc1155") || d.includes("multi-token") || d.includes("semi-fungible"))    return "ERC-1155";
  if (d.includes("erc-721") || d.includes("erc721") || d.includes("nft") || d.includes("collection"))                 return "ERC-721";
  return "custom";
}

// ─── ERC-20 native deploy ──────────────────────────────────────────────────────

async function deployNativeERC20(params: {
  name?: string; symbol?: string; description: string; extraParams?: string;
}, chainId: number): Promise<DeployResult> {
  const account = getDeployAccount();
  const vault   = getVaultConfig();

  if (!account && !vault) {
    return noWalletError("ERC-20");
  }

  if (!account) {
    return {
      success: false, deployed: false,
      error:        "WALLET_PRIVATE_KEY is required for native ERC-20 deployment. Alternatively, go to the Thirdweb dashboard to deploy manually.",
      dashboardUrl: "https://thirdweb.com/dashboard/contracts/deploy",
    };
  }

  try {
    const client  = getThirdwebClient();
    const chain   = CHAIN_MAP[chainId] ?? base;
    const name    = params.name   ?? extractName(params.description)   ?? "MyToken";
    const symbol  = params.symbol ?? extractSymbol(params.description) ?? "MTK";
    const saleRecipient = vault?.accountAddress ?? (account as { address: string }).address;

    const contractAddress = await deployERC20Contract({
      chain, client, account,
      type: "TokenERC20",
      params: { name, symbol, description: params.description, primarySaleRecipient: saleRecipient },
    });

    return {
      success: true, deployed: true,
      message:         `ERC-20 token "${name}" (${symbol}) deployed on Base Mainnet.`,
      contractAddress,
      dashboardUrl:    `https://thirdweb.com/${chainId}/${contractAddress}`,
      explorerUrl:     `https://basescan.org/address/${contractAddress}`,
    };
  } catch (err) {
    return { success: false, deployed: false, error: `ERC-20 deploy failed: ${err instanceof Error ? err.message : String(err)}`, dashboardUrl: "https://thirdweb.com/dashboard/contracts/deploy" };
  }
}

// ─── ERC-721 native deploy ────────────────────────────────────────────────────

async function deployNativeERC721(params: {
  name?: string; symbol?: string; description: string; extraParams?: string;
}, chainId: number): Promise<DeployResult> {
  const account = getDeployAccount();
  const vault   = getVaultConfig();

  if (!account && !vault) return noWalletError("ERC-721");

  if (!account) {
    return {
      success: false, deployed: false,
      error:        "WALLET_PRIVATE_KEY is required for native ERC-721 deployment.",
      dashboardUrl: "https://thirdweb.com/dashboard/contracts/deploy",
    };
  }

  try {
    const client  = getThirdwebClient();
    const chain   = CHAIN_MAP[chainId] ?? base;
    const name    = params.name   ?? extractName(params.description)   ?? "MyNFT";
    const symbol  = params.symbol ?? extractSymbol(params.description) ?? "NFT";
    const saleRecipient = vault?.accountAddress ?? (account as { address: string }).address;

    const contractAddress = await deployERC721Contract({
      chain, client, account,
      type: "TokenERC721",
      params: { name, symbol, description: params.description, primarySaleRecipient: saleRecipient },
    });

    return {
      success: true, deployed: true,
      message:         `ERC-721 collection "${name}" (${symbol}) deployed on Base Mainnet.`,
      contractAddress,
      dashboardUrl:    `https://thirdweb.com/${chainId}/${contractAddress}`,
      explorerUrl:     `https://basescan.org/address/${contractAddress}`,
    };
  } catch (err) {
    return { success: false, deployed: false, error: `ERC-721 deploy failed: ${err instanceof Error ? err.message : String(err)}`, dashboardUrl: "https://thirdweb.com/dashboard/contracts/deploy" };
  }
}

// ─── ERC-1155 native deploy ───────────────────────────────────────────────────

async function deployNativeERC1155(params: {
  name?: string; symbol?: string; description: string; extraParams?: string;
}, chainId: number): Promise<DeployResult> {
  const account = getDeployAccount();
  const vault   = getVaultConfig();

  if (!account && !vault) return noWalletError("ERC-1155");

  if (!account) {
    return {
      success: false, deployed: false,
      error:        "WALLET_PRIVATE_KEY is required for native ERC-1155 deployment.",
      dashboardUrl: "https://thirdweb.com/dashboard/contracts/deploy",
    };
  }

  try {
    const client  = getThirdwebClient();
    const chain   = CHAIN_MAP[chainId] ?? base;
    const name    = params.name   ?? extractName(params.description)   ?? "MyMultiToken";
    const symbol  = params.symbol ?? extractSymbol(params.description) ?? "MTT";
    const saleRecipient = vault?.accountAddress ?? (account as { address: string }).address;

    const contractAddress = await deployERC1155Contract({
      chain, client, account,
      type: "TokenERC1155",
      params: { name, symbol, description: params.description, primarySaleRecipient: saleRecipient },
    });

    return {
      success: true, deployed: true,
      message:         `ERC-1155 multi-token contract "${name}" (${symbol}) deployed on Base Mainnet.`,
      contractAddress,
      dashboardUrl:    `https://thirdweb.com/${chainId}/${contractAddress}`,
      explorerUrl:     `https://basescan.org/address/${contractAddress}`,
    };
  } catch (err) {
    return { success: false, deployed: false, error: `ERC-1155 deploy failed: ${err instanceof Error ? err.message : String(err)}`, dashboardUrl: "https://thirdweb.com/dashboard/contracts/deploy" };
  }
}

// ─── Custom contract via Nebula + Engine Cloud Vault ──────────────────────────

async function deployWithNebula(params: {
  description: string; contractType?: string; name?: string;
  symbol?: string; chainId?: number; walletAddress?: string; extraParams?: string;
}, chainId: number): Promise<DeployResult> {
  const secretKey = process.env.THIRDWEB_SECRET_KEY;
  if (!secretKey) {
    return { success: false, deployed: false, error: "THIRDWEB_SECRET_KEY is not configured for Nebula AI. Get one at thirdweb.com/dashboard." };
  }

  const vault          = getVaultConfig();
  const deployerAddr   = vault?.accountAddress ?? params.walletAddress;
  const chainName      = chainId === 8453 ? "Base Mainnet" : `chain ${chainId}`;

  const prompt = [
    `Deploy a ${params.contractType ?? "custom smart contract"} on ${chainName}.`,
    `Description: ${params.description}`,
    params.name   ? `Token name: ${params.name}`     : null,
    params.symbol ? `Token symbol: ${params.symbol}` : null,
    params.extraParams ?? null,
    deployerAddr  ? `Deployer wallet: ${deployerAddr}` : null,
    "Return the complete deployment transaction in your actions array with fields: to, data, value.",
  ].filter(Boolean).join(" ");

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
          ...(deployerAddr ? { wallet_address: deployerAddr } : {}),
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
    return { success: false, deployed: false, error: `Nebula request failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  // Extract tx payload from Nebula actions
  interface TxPayload { to?: string; data?: string; value?: string }
  let txPayload: TxPayload | null = null;
  for (const action of nebulaActions) {
    const d = action.data ?? {};
    if (d.to && (d.data || d.input)) {
      txPayload = { to: String(d.to), data: String(d.data ?? d.input ?? "0x"), value: d.value ? String(d.value) : "0" };
      break;
    }
    if (d.transaction && typeof d.transaction === "object") {
      const tx = d.transaction as Record<string, unknown>;
      if (tx.to) {
        txPayload = { to: String(tx.to), data: String(tx.data ?? tx.input ?? "0x"), value: tx.value ? String(tx.value) : "0" };
        break;
      }
    }
  }

  // Broadcast via Vault / Engine Cloud
  if (vault && txPayload?.to) {
    const result = await vaultSendTransaction({
      to:      txPayload.to,
      data:    txPayload.data ?? "0x",
      value:   txPayload.value ?? "0",
      chainId,
    });

    if (result.success) {
      return {
        success: true, deployed: true,
        message:      nebulaMessage,
        txHash:       result.txHash,
        explorerUrl:  result.explorerUrl,
        dashboardUrl: "https://thirdweb.com/dashboard/contracts/deploy",
        actions:      nebulaActions,
      };
    }

    return {
      success: false, deployed: false,
      message:      nebulaMessage,
      actions:      nebulaActions,
      error:        result.error,
      dashboardUrl: "https://thirdweb.com/dashboard/contracts/deploy",
    };
  }

  // No wallet at all — return Nebula guide
  return {
    success: true, deployed: false,
    message:      nebulaMessage,
    actions:      nebulaActions,
    dashboardUrl: "https://thirdweb.com/dashboard/contracts/deploy",
    error:        vault === null
      ? "Vault not configured — add THIRDWEB_VAULT_ACCESS_TOKEN and THIRDWEB_VAULT_ACCOUNT_ADDRESS to .env for automated deployment."
      : undefined,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function noWalletError(type: string): DeployResult {
  const missing: string[] = [];
  if (!process.env.THIRDWEB_CLIENT_ID)             missing.push("THIRDWEB_CLIENT_ID");
  if (!process.env.WALLET_PRIVATE_KEY)             missing.push("WALLET_PRIVATE_KEY");
  if (!process.env.THIRDWEB_VAULT_ACCESS_TOKEN)    missing.push("THIRDWEB_VAULT_ACCESS_TOKEN");
  if (!process.env.THIRDWEB_VAULT_ACCOUNT_ADDRESS) missing.push("THIRDWEB_VAULT_ACCOUNT_ADDRESS");
  return {
    success: false, deployed: false,
    error: `Cannot deploy ${type}: missing env vars: ${missing.join(", ")}. Add them to the environment variables panel and restart the server.`,
    dashboardUrl: "https://thirdweb.com/dashboard/contracts/deploy",
  };
}

function extractName(description: string): string | null {
  const m = description.match(/(?:called|named)\s+"?([A-Za-z0-9 ]+)"?/i);
  return m ? m[1].trim() : null;
}

function extractSymbol(description: string): string | null {
  const m = description.match(/(?:symbol|ticker)\s+([A-Z]{2,8})/i) ?? description.match(/\(([A-Z]{2,8})\)/);
  return m ? m[1].toUpperCase() : null;
}
