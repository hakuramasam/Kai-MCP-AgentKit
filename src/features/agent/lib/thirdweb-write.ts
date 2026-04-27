/**
 * Thirdweb on-chain write operations via Vault + Engine Cloud.
 *
 * Supports:
 *   ERC-721: mintTo, transferFrom, burn
 *   ERC-1155: mintTo, safeTransferFrom, burn
 *   ERC-20:  mintTo, transfer, burn
 *
 * Signs and broadcasts using Thirdweb Vault (Engine Cloud /v1/write/contract).
 * The private key never lives in this server — Vault handles signing remotely.
 *
 * Falls back to WALLET_PRIVATE_KEY + native SDK if Vault is not configured.
 */

import { createThirdwebClient, getContract } from "thirdweb";
import { base, mainnet, polygon, arbitrum, optimism } from "thirdweb/chains";
import { privateKeyToAccount } from "thirdweb/wallets";
import { getGaslessAccount, isGaslessConfigured, sendAndConfirmTransaction } from "@/features/agent/lib/gasless";
import {
  mintTo    as erc721MintTo,
  transferFrom as erc721TransferFrom,
  burn      as erc721Burn,
} from "thirdweb/extensions/erc721";
import {
  mintTo         as erc1155MintTo,
  safeTransferFrom as erc1155TransferFrom,
  burn           as erc1155Burn,
} from "thirdweb/extensions/erc1155";
import {
  mintTo   as erc20MintTo,
  transfer as erc20Transfer,
  burn     as erc20Burn,
} from "thirdweb/extensions/erc20";
import { getVaultConfig, vaultWriteContract, type VaultWriteContractResult } from "@/features/agent/lib/vault";

// ─── Chain map ────────────────────────────────────────────────────────────────

const CHAIN_MAP: Record<number, typeof base> = {
  1: mainnet, 8453: base, 137: polygon, 42161: arbitrum, 10: optimism,
};

function resolveChain(chainId: number) {
  return CHAIN_MAP[chainId] ?? base;
}

// ─── Result type ──────────────────────────────────────────────────────────────

export interface WriteResult {
  success: boolean;
  txHash?: string;
  queueId?: string;
  explorerUrl?: string;
  contractAddress?: string;
  tokenId?: string;
  error?: string;
}

// ─── SDK fallback (WALLET_PRIVATE_KEY path) ───────────────────────────────────

function getSdkAccount() {
  const rawKey    = process.env.WALLET_PRIVATE_KEY;
  if (!rawKey?.startsWith("0x") || rawKey.length !== 66) return null;
  const secretKey = process.env.THIRDWEB_SECRET_KEY;
  const clientId  = process.env.THIRDWEB_CLIENT_ID;
  if (!secretKey && !clientId) return null;
  const client = secretKey
    ? createThirdwebClient({ secretKey })
    : createThirdwebClient({ clientId: clientId! });
  return { account: privateKeyToAccount({ privateKey: rawKey as `0x${string}`, client }), client };
}

function toWriteResult(r: VaultWriteContractResult, tokenId?: string): WriteResult {
  return { ...r, tokenId };
}

// ─── ERC-721 write operations ─────────────────────────────────────────────────

export async function mintERC721(params: {
  contractAddress: string;
  to: string;
  metadataUri: string;
  chainId?: number;
}): Promise<WriteResult> {
  const chainId = params.chainId ?? 8453;

  // ── Tier 1: Gasless smart account ────────────────────────────────────────
  if (isGaslessConfigured()) {
    try {
      const { smartAccount, client } = await getGaslessAccount(chainId);
      const contract = getContract({ client, chain: resolveChain(chainId), address: params.contractAddress });
      const tx = erc721MintTo({ contract, to: params.to, nft: params.metadataUri });
      const receipt = await sendAndConfirmTransaction({ transaction: tx, account: smartAccount });
      return { success: true, txHash: receipt.transactionHash, explorerUrl: `https://basescan.org/tx/${receipt.transactionHash}` };
    } catch (err) {
      console.error("[nft_write] gasless mintERC721 failed:", err instanceof Error ? err.message : String(err));
    }
  }

  // ── Tier 2: Vault / Engine Cloud ─────────────────────────────────────────
  const vault = getVaultConfig();
  if (vault) {
    return toWriteResult(await vaultWriteContract({
      contractAddress: params.contractAddress,
      method: "function mintTo(address to, string memory uri)",
      args:   [params.to, params.metadataUri],
      chainId,
    }));
  }

  // ── Tier 3: SDK with WALLET_PRIVATE_KEY ──────────────────────────────────
  const sdk = getSdkAccount();
  if (!sdk) return noWalletError();
  try {
    const contract = getContract({ client: sdk.client, chain: resolveChain(chainId), address: params.contractAddress });
    const tx = erc721MintTo({ contract, to: params.to, nft: params.metadataUri });
    const receipt = await sendAndConfirmTransaction({ transaction: tx, account: sdk.account });
    return { success: true, txHash: receipt.transactionHash, explorerUrl: `https://basescan.org/tx/${receipt.transactionHash}` };
  } catch (err) {
    return { success: false, error: `ERC-721 mint failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function transferERC721(params: {
  contractAddress: string;
  from: string;
  to: string;
  tokenId: number;
  chainId?: number;
}): Promise<WriteResult> {
  const chainId = params.chainId ?? 8453;

  if (isGaslessConfigured()) {
    try {
      const { smartAccount, client } = await getGaslessAccount(chainId);
      const contract = getContract({ client, chain: resolveChain(chainId), address: params.contractAddress });
      const tx = erc721TransferFrom({ contract, from: params.from, to: params.to, tokenId: BigInt(params.tokenId) });
      const receipt = await sendAndConfirmTransaction({ transaction: tx, account: smartAccount });
      return { success: true, txHash: receipt.transactionHash, tokenId: String(params.tokenId), explorerUrl: `https://basescan.org/tx/${receipt.transactionHash}` };
    } catch (err) { console.error("[nft_write] gasless transferERC721 failed:", err instanceof Error ? err.message : String(err)); }
  }

  const vault = getVaultConfig();
  if (vault) return toWriteResult(await vaultWriteContract({ contractAddress: params.contractAddress, method: "function transferFrom(address from, address to, uint256 tokenId)", args: [params.from, params.to, String(params.tokenId)], chainId }), String(params.tokenId));

  const sdk = getSdkAccount();
  if (!sdk) return noWalletError();
  try {
    const contract = getContract({ client: sdk.client, chain: resolveChain(chainId), address: params.contractAddress });
    const tx = erc721TransferFrom({ contract, from: params.from, to: params.to, tokenId: BigInt(params.tokenId) });
    const receipt = await sendAndConfirmTransaction({ transaction: tx, account: sdk.account });
    return { success: true, txHash: receipt.transactionHash, tokenId: String(params.tokenId), explorerUrl: `https://basescan.org/tx/${receipt.transactionHash}` };
  } catch (err) { return { success: false, error: `ERC-721 transfer failed: ${err instanceof Error ? err.message : String(err)}` }; }
}

export async function burnERC721(params: {
  contractAddress: string;
  tokenId: number;
  chainId?: number;
}): Promise<WriteResult> {
  const chainId = params.chainId ?? 8453;

  if (isGaslessConfigured()) {
    try {
      const { smartAccount, client } = await getGaslessAccount(chainId);
      const contract = getContract({ client, chain: resolveChain(chainId), address: params.contractAddress });
      const tx = erc721Burn({ contract, tokenId: BigInt(params.tokenId) });
      const receipt = await sendAndConfirmTransaction({ transaction: tx, account: smartAccount });
      return { success: true, txHash: receipt.transactionHash, tokenId: String(params.tokenId), explorerUrl: `https://basescan.org/tx/${receipt.transactionHash}` };
    } catch (err) { console.error("[nft_write] gasless burnERC721 failed:", err instanceof Error ? err.message : String(err)); }
  }

  const vault = getVaultConfig();
  if (vault) return toWriteResult(await vaultWriteContract({ contractAddress: params.contractAddress, method: "function burn(uint256 tokenId)", args: [String(params.tokenId)], chainId }), String(params.tokenId));

  const sdk = getSdkAccount();
  if (!sdk) return noWalletError();
  try {
    const contract = getContract({ client: sdk.client, chain: resolveChain(chainId), address: params.contractAddress });
    const tx = erc721Burn({ contract, tokenId: BigInt(params.tokenId) });
    const receipt = await sendAndConfirmTransaction({ transaction: tx, account: sdk.account });
    return { success: true, txHash: receipt.transactionHash, tokenId: String(params.tokenId), explorerUrl: `https://basescan.org/tx/${receipt.transactionHash}` };
  } catch (err) { return { success: false, error: `ERC-721 burn failed: ${err instanceof Error ? err.message : String(err)}` }; }
}

// ─── ERC-1155 write operations ────────────────────────────────────────────────

export async function mintERC1155(params: {
  contractAddress: string;
  to: string;
  tokenId: number;
  amount: number;
  metadataUri?: string;
  chainId?: number;
}): Promise<WriteResult> {
  const chainId = params.chainId ?? 8453;

  if (isGaslessConfigured()) {
    try {
      const { smartAccount, client } = await getGaslessAccount(chainId);
      const contract = getContract({ client, chain: resolveChain(chainId), address: params.contractAddress });
      const tx = erc1155MintTo({ contract, to: params.to, tokenId: BigInt(params.tokenId), supply: BigInt(params.amount), nft: params.metadataUri ?? "" });
      const receipt = await sendAndConfirmTransaction({ transaction: tx, account: smartAccount });
      return { success: true, txHash: receipt.transactionHash, tokenId: String(params.tokenId), explorerUrl: `https://basescan.org/tx/${receipt.transactionHash}` };
    } catch (err) { console.error("[nft_write] gasless mintERC1155 failed:", err instanceof Error ? err.message : String(err)); }
  }

  const vault = getVaultConfig();
  if (vault) return toWriteResult(await vaultWriteContract({ contractAddress: params.contractAddress, method: "function mintTo(address to, uint256 tokenId, string memory uri, uint256 amount)", args: [params.to, String(params.tokenId), params.metadataUri ?? "", String(params.amount)], chainId }), String(params.tokenId));

  const sdk = getSdkAccount();
  if (!sdk) return noWalletError();
  try {
    const contract = getContract({ client: sdk.client, chain: resolveChain(chainId), address: params.contractAddress });
    const tx = erc1155MintTo({ contract, to: params.to, tokenId: BigInt(params.tokenId), supply: BigInt(params.amount), nft: params.metadataUri ?? "" });
    const receipt = await sendAndConfirmTransaction({ transaction: tx, account: sdk.account });
    return { success: true, txHash: receipt.transactionHash, tokenId: String(params.tokenId), explorerUrl: `https://basescan.org/tx/${receipt.transactionHash}` };
  } catch (err) { return { success: false, error: `ERC-1155 mint failed: ${err instanceof Error ? err.message : String(err)}` }; }
}

export async function transferERC1155(params: {
  contractAddress: string;
  from: string;
  to: string;
  tokenId: number;
  amount: number;
  chainId?: number;
}): Promise<WriteResult> {
  const chainId = params.chainId ?? 8453;

  if (isGaslessConfigured()) {
    try {
      const { smartAccount, client } = await getGaslessAccount(chainId);
      const contract = getContract({ client, chain: resolveChain(chainId), address: params.contractAddress });
      const tx = erc1155TransferFrom({ contract, from: params.from, to: params.to, tokenId: BigInt(params.tokenId), value: BigInt(params.amount), data: "0x" });
      const receipt = await sendAndConfirmTransaction({ transaction: tx, account: smartAccount });
      return { success: true, txHash: receipt.transactionHash, tokenId: String(params.tokenId), explorerUrl: `https://basescan.org/tx/${receipt.transactionHash}` };
    } catch (err) { console.error("[nft_write] gasless transferERC1155 failed:", err instanceof Error ? err.message : String(err)); }
  }

  const vault = getVaultConfig();
  if (vault) return toWriteResult(await vaultWriteContract({ contractAddress: params.contractAddress, method: "function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)", args: [params.from, params.to, String(params.tokenId), String(params.amount), "0x"], chainId }), String(params.tokenId));

  const sdk = getSdkAccount();
  if (!sdk) return noWalletError();
  try {
    const contract = getContract({ client: sdk.client, chain: resolveChain(chainId), address: params.contractAddress });
    const tx = erc1155TransferFrom({ contract, from: params.from, to: params.to, tokenId: BigInt(params.tokenId), value: BigInt(params.amount), data: "0x" });
    const receipt = await sendAndConfirmTransaction({ transaction: tx, account: sdk.account });
    return { success: true, txHash: receipt.transactionHash, tokenId: String(params.tokenId), explorerUrl: `https://basescan.org/tx/${receipt.transactionHash}` };
  } catch (err) { return { success: false, error: `ERC-1155 transfer failed: ${err instanceof Error ? err.message : String(err)}` }; }
}

export async function burnERC1155(params: {
  contractAddress: string;
  tokenId: number;
  amount: number;
  chainId?: number;
}): Promise<WriteResult> {
  const chainId = params.chainId ?? 8453;

  if (isGaslessConfigured()) {
    try {
      const { smartAccount, client } = await getGaslessAccount(chainId);
      const contract = getContract({ client, chain: resolveChain(chainId), address: params.contractAddress });
      const tx = erc1155Burn({ contract, owner: (smartAccount as { address: string }).address, tokenId: BigInt(params.tokenId), value: BigInt(params.amount) });
      const receipt = await sendAndConfirmTransaction({ transaction: tx, account: smartAccount });
      return { success: true, txHash: receipt.transactionHash, tokenId: String(params.tokenId), explorerUrl: `https://basescan.org/tx/${receipt.transactionHash}` };
    } catch (err) { console.error("[nft_write] gasless burnERC1155 failed:", err instanceof Error ? err.message : String(err)); }
  }

  const vault = getVaultConfig();
  if (vault) return toWriteResult(await vaultWriteContract({ contractAddress: params.contractAddress, method: "function burn(address account, uint256 id, uint256 value)", args: [vault.accountAddress, String(params.tokenId), String(params.amount)], chainId }), String(params.tokenId));

  const sdk = getSdkAccount();
  if (!sdk) return noWalletError();
  try {
    const contract = getContract({ client: sdk.client, chain: resolveChain(chainId), address: params.contractAddress });
    const tx = erc1155Burn({ contract, owner: (sdk.account as { address: string }).address, tokenId: BigInt(params.tokenId), value: BigInt(params.amount) });
    const receipt = await sendAndConfirmTransaction({ transaction: tx, account: sdk.account });
    return { success: true, txHash: receipt.transactionHash, tokenId: String(params.tokenId), explorerUrl: `https://basescan.org/tx/${receipt.transactionHash}` };
  } catch (err) { return { success: false, error: `ERC-1155 burn failed: ${err instanceof Error ? err.message : String(err)}` }; }
}

// ─── ERC-20 write operations ──────────────────────────────────────────────────

export async function mintERC20(params: {
  contractAddress: string;
  to: string;
  amount: string;
  chainId?: number;
}): Promise<WriteResult> {
  const chainId = params.chainId ?? 8453;

  if (isGaslessConfigured()) {
    try {
      const { smartAccount, client } = await getGaslessAccount(chainId);
      const contract = getContract({ client, chain: resolveChain(chainId), address: params.contractAddress });
      const tx = erc20MintTo({ contract, to: params.to, amount: params.amount });
      const receipt = await sendAndConfirmTransaction({ transaction: tx, account: smartAccount });
      return { success: true, txHash: receipt.transactionHash, explorerUrl: `https://basescan.org/tx/${receipt.transactionHash}` };
    } catch (err) { console.error("[token_write] gasless mintERC20 failed:", err instanceof Error ? err.message : String(err)); }
  }

  const vault = getVaultConfig();
  if (vault) return toWriteResult(await vaultWriteContract({ contractAddress: params.contractAddress, method: "function mintTo(address to, uint256 amount)", args: [params.to, params.amount], chainId }));

  const sdk = getSdkAccount();
  if (!sdk) return noWalletError();
  try {
    const contract = getContract({ client: sdk.client, chain: resolveChain(chainId), address: params.contractAddress });
    const tx = erc20MintTo({ contract, to: params.to, amount: params.amount });
    const receipt = await sendAndConfirmTransaction({ transaction: tx, account: sdk.account });
    return { success: true, txHash: receipt.transactionHash, explorerUrl: `https://basescan.org/tx/${receipt.transactionHash}` };
  } catch (err) { return { success: false, error: `ERC-20 mint failed: ${err instanceof Error ? err.message : String(err)}` }; }
}

export async function transferERC20(params: {
  contractAddress: string;
  to: string;
  amount: string;
  chainId?: number;
}): Promise<WriteResult> {
  const chainId = params.chainId ?? 8453;

  if (isGaslessConfigured()) {
    try {
      const { smartAccount, client } = await getGaslessAccount(chainId);
      const contract = getContract({ client, chain: resolveChain(chainId), address: params.contractAddress });
      const tx = erc20Transfer({ contract, to: params.to, amount: params.amount });
      const receipt = await sendAndConfirmTransaction({ transaction: tx, account: smartAccount });
      return { success: true, txHash: receipt.transactionHash, explorerUrl: `https://basescan.org/tx/${receipt.transactionHash}` };
    } catch (err) { console.error("[token_write] gasless transferERC20 failed:", err instanceof Error ? err.message : String(err)); }
  }

  const vault = getVaultConfig();
  if (vault) return toWriteResult(await vaultWriteContract({ contractAddress: params.contractAddress, method: "function transfer(address to, uint256 amount)", args: [params.to, params.amount], chainId }));

  const sdk = getSdkAccount();
  if (!sdk) return noWalletError();
  try {
    const contract = getContract({ client: sdk.client, chain: resolveChain(chainId), address: params.contractAddress });
    const tx = erc20Transfer({ contract, to: params.to, amount: params.amount });
    const receipt = await sendAndConfirmTransaction({ transaction: tx, account: sdk.account });
    return { success: true, txHash: receipt.transactionHash, explorerUrl: `https://basescan.org/tx/${receipt.transactionHash}` };
  } catch (err) { return { success: false, error: `ERC-20 transfer failed: ${err instanceof Error ? err.message : String(err)}` }; }
}

export async function burnERC20(params: {
  contractAddress: string;
  amount: string;
  chainId?: number;
}): Promise<WriteResult> {
  const chainId = params.chainId ?? 8453;

  if (isGaslessConfigured()) {
    try {
      const { smartAccount, client } = await getGaslessAccount(chainId);
      const contract = getContract({ client, chain: resolveChain(chainId), address: params.contractAddress });
      const tx = erc20Burn({ contract, amount: params.amount });
      const receipt = await sendAndConfirmTransaction({ transaction: tx, account: smartAccount });
      return { success: true, txHash: receipt.transactionHash, explorerUrl: `https://basescan.org/tx/${receipt.transactionHash}` };
    } catch (err) { console.error("[token_write] gasless burnERC20 failed:", err instanceof Error ? err.message : String(err)); }
  }

  const vault = getVaultConfig();
  if (vault) return toWriteResult(await vaultWriteContract({ contractAddress: params.contractAddress, method: "function burn(uint256 amount)", args: [params.amount], chainId }));

  const sdk = getSdkAccount();
  if (!sdk) return noWalletError();
  try {
    const contract = getContract({ client: sdk.client, chain: resolveChain(chainId), address: params.contractAddress });
    const tx = erc20Burn({ contract, amount: params.amount });
    const receipt = await sendAndConfirmTransaction({ transaction: tx, account: sdk.account });
    return { success: true, txHash: receipt.transactionHash, explorerUrl: `https://basescan.org/tx/${receipt.transactionHash}` };
  } catch (err) { return { success: false, error: `ERC-20 burn failed: ${err instanceof Error ? err.message : String(err)}` }; }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function noWalletError(): WriteResult {
  return {
    success: false,
    error: "No signing wallet configured. Add THIRDWEB_VAULT_ACCESS_TOKEN + THIRDWEB_VAULT_ACCOUNT_ADDRESS (preferred) or WALLET_PRIVATE_KEY to .env.",
  };
}
