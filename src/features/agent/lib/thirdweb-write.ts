/**
 * Thirdweb on-chain write operations.
 *
 * Supports:
 *   - ERC-721: mintTo, transferFrom, burn
 *   - ERC-1155: mintTo, safeTransferFrom, burn
 *   - ERC-20: mintTo, transfer, burn, approve
 *
 * Uses thirdweb SDK v5 sendAndConfirmTransaction with privateKeyToAccount.
 */

import { createThirdwebClient, getContract, sendAndConfirmTransaction } from "thirdweb";
import { base, mainnet, polygon, arbitrum, optimism } from "thirdweb/chains";
import { privateKeyToAccount } from "thirdweb/wallets";
import {
  mintTo as erc721MintTo,
  transferFrom as erc721TransferFrom,
  burn as erc721Burn,
} from "thirdweb/extensions/erc721";
import {
  mintTo as erc1155MintTo,
  safeTransferFrom as erc1155TransferFrom,
  burn as erc1155Burn,
} from "thirdweb/extensions/erc1155";
import {
  mintTo as erc20MintTo,
  transfer as erc20Transfer,
  burn as erc20Burn,
} from "thirdweb/extensions/erc20";

// ─── Client setup ─────────────────────────────────────────────────────────────

function getClient() {
  const clientId = process.env.THIRDWEB_CLIENT_ID;
  if (!clientId) throw new Error("THIRDWEB_CLIENT_ID is not configured. Get a free key at thirdweb.com/dashboard");
  return createThirdwebClient({ clientId });
}

function getAccount() {
  const rawKey = process.env.WALLET_PRIVATE_KEY;
  if (!rawKey?.startsWith("0x") || rawKey.length !== 66) {
    throw new Error("WALLET_PRIVATE_KEY is not configured or invalid. Add a 32-byte hex key to .env.");
  }
  const client = getClient();
  return privateKeyToAccount({ privateKey: rawKey as `0x${string}`, client });
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

// ─── Result type ──────────────────────────────────────────────────────────────

export interface WriteResult {
  success: boolean;
  txHash?: string;
  explorerUrl?: string;
  contractAddress?: string;
  tokenId?: string;
  error?: string;
}

// ─── ERC-721 write operations ─────────────────────────────────────────────────

/**
 * Mint an ERC-721 NFT to a recipient address.
 * metadataUri should be an IPFS URI or HTTP URL with the token metadata JSON.
 */
export async function mintERC721(params: {
  contractAddress: string;
  to: string;
  metadataUri: string;
  chainId?: number;
}): Promise<WriteResult> {
  try {
    const client  = getClient();
    const account = getAccount();
    const chain   = resolveChain(params.chainId ?? 8453);
    const contract = getContract({ client, chain, address: params.contractAddress });

    const tx = erc721MintTo({
      contract,
      to: params.to,
      nft: params.metadataUri,
    });

    const receipt = await sendAndConfirmTransaction({ transaction: tx, account });
    const txHash = receipt.transactionHash;

    return {
      success: true,
      txHash,
      explorerUrl: `https://basescan.org/tx/${txHash}`,
      contractAddress: params.contractAddress,
    };
  } catch (err) {
    return {
      success: false,
      error: `ERC-721 mint failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Transfer an ERC-721 token to a new owner.
 */
export async function transferERC721(params: {
  contractAddress: string;
  from: string;
  to: string;
  tokenId: number;
  chainId?: number;
}): Promise<WriteResult> {
  try {
    const client   = getClient();
    const account  = getAccount();
    const chain    = resolveChain(params.chainId ?? 8453);
    const contract = getContract({ client, chain, address: params.contractAddress });

    const tx = erc721TransferFrom({
      contract,
      from: params.from,
      to: params.to,
      tokenId: BigInt(params.tokenId),
    });

    const receipt = await sendAndConfirmTransaction({ transaction: tx, account });
    const txHash = receipt.transactionHash;

    return {
      success: true,
      txHash,
      explorerUrl: `https://basescan.org/tx/${txHash}`,
      tokenId: String(params.tokenId),
    };
  } catch (err) {
    return {
      success: false,
      error: `ERC-721 transfer failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Burn (destroy) an ERC-721 token.
 */
export async function burnERC721(params: {
  contractAddress: string;
  tokenId: number;
  chainId?: number;
}): Promise<WriteResult> {
  try {
    const client   = getClient();
    const account  = getAccount();
    const chain    = resolveChain(params.chainId ?? 8453);
    const contract = getContract({ client, chain, address: params.contractAddress });

    const tx = erc721Burn({
      contract,
      tokenId: BigInt(params.tokenId),
    });

    const receipt = await sendAndConfirmTransaction({ transaction: tx, account });
    const txHash = receipt.transactionHash;

    return {
      success: true,
      txHash,
      explorerUrl: `https://basescan.org/tx/${txHash}`,
      tokenId: String(params.tokenId),
    };
  } catch (err) {
    return {
      success: false,
      error: `ERC-721 burn failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── ERC-1155 write operations ────────────────────────────────────────────────

/**
 * Mint ERC-1155 tokens to a recipient.
 */
export async function mintERC1155(params: {
  contractAddress: string;
  to: string;
  tokenId: number;
  amount: number;
  metadataUri?: string;
  chainId?: number;
}): Promise<WriteResult> {
  try {
    const client   = getClient();
    const account  = getAccount();
    const chain    = resolveChain(params.chainId ?? 8453);
    const contract = getContract({ client, chain, address: params.contractAddress });

    const tx = erc1155MintTo({
      contract,
      to: params.to,
      tokenId: BigInt(params.tokenId),
      supply: BigInt(params.amount),
      nft: params.metadataUri ?? "",
    });

    const receipt = await sendAndConfirmTransaction({ transaction: tx, account });
    const txHash = receipt.transactionHash;

    return {
      success: true,
      txHash,
      explorerUrl: `https://basescan.org/tx/${txHash}`,
      tokenId: String(params.tokenId),
    };
  } catch (err) {
    return {
      success: false,
      error: `ERC-1155 mint failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Transfer ERC-1155 tokens between addresses.
 */
export async function transferERC1155(params: {
  contractAddress: string;
  from: string;
  to: string;
  tokenId: number;
  amount: number;
  chainId?: number;
}): Promise<WriteResult> {
  try {
    const client   = getClient();
    const account  = getAccount();
    const chain    = resolveChain(params.chainId ?? 8453);
    const contract = getContract({ client, chain, address: params.contractAddress });

    const tx = erc1155TransferFrom({
      contract,
      from: params.from,
      to: params.to,
      tokenId: BigInt(params.tokenId),
      value: BigInt(params.amount),
      data: "0x",
    });

    const receipt = await sendAndConfirmTransaction({ transaction: tx, account });
    const txHash = receipt.transactionHash;

    return {
      success: true,
      txHash,
      explorerUrl: `https://basescan.org/tx/${txHash}`,
      tokenId: String(params.tokenId),
    };
  } catch (err) {
    return {
      success: false,
      error: `ERC-1155 transfer failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Burn ERC-1155 tokens.
 */
export async function burnERC1155(params: {
  contractAddress: string;
  tokenId: number;
  amount: number;
  chainId?: number;
}): Promise<WriteResult> {
  try {
    const client   = getClient();
    const account  = getAccount();
    const chain    = resolveChain(params.chainId ?? 8453);
    const contract = getContract({ client, chain, address: params.contractAddress });

    const tx = erc1155Burn({
      contract,
      owner: (account as { address: string }).address,
      tokenId: BigInt(params.tokenId),
      value: BigInt(params.amount),
    });

    const receipt = await sendAndConfirmTransaction({ transaction: tx, account });
    const txHash = receipt.transactionHash;

    return {
      success: true,
      txHash,
      explorerUrl: `https://basescan.org/tx/${txHash}`,
      tokenId: String(params.tokenId),
    };
  } catch (err) {
    return {
      success: false,
      error: `ERC-1155 burn failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── ERC-20 write operations ──────────────────────────────────────────────────

/**
 * Mint ERC-20 tokens to a recipient address.
 * amount is the human-readable token amount (e.g. "1000" for 1000 tokens).
 */
export async function mintERC20(params: {
  contractAddress: string;
  to: string;
  amount: string;
  chainId?: number;
}): Promise<WriteResult> {
  try {
    const client   = getClient();
    const account  = getAccount();
    const chain    = resolveChain(params.chainId ?? 8453);
    const contract = getContract({ client, chain, address: params.contractAddress });

    const tx = erc20MintTo({
      contract,
      to: params.to,
      amount: params.amount,
    });

    const receipt = await sendAndConfirmTransaction({ transaction: tx, account });
    const txHash = receipt.transactionHash;

    return {
      success: true,
      txHash,
      explorerUrl: `https://basescan.org/tx/${txHash}`,
      contractAddress: params.contractAddress,
    };
  } catch (err) {
    return {
      success: false,
      error: `ERC-20 mint failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Transfer ERC-20 tokens to a recipient address.
 * amount is the human-readable token amount.
 */
export async function transferERC20(params: {
  contractAddress: string;
  to: string;
  amount: string;
  chainId?: number;
}): Promise<WriteResult> {
  try {
    const client   = getClient();
    const account  = getAccount();
    const chain    = resolveChain(params.chainId ?? 8453);
    const contract = getContract({ client, chain, address: params.contractAddress });

    const tx = erc20Transfer({
      contract,
      to: params.to,
      amount: params.amount,
    });

    const receipt = await sendAndConfirmTransaction({ transaction: tx, account });
    const txHash = receipt.transactionHash;

    return {
      success: true,
      txHash,
      explorerUrl: `https://basescan.org/tx/${txHash}`,
      contractAddress: params.contractAddress,
    };
  } catch (err) {
    return {
      success: false,
      error: `ERC-20 transfer failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Burn ERC-20 tokens from the server wallet.
 * amount is the human-readable token amount.
 */
export async function burnERC20(params: {
  contractAddress: string;
  amount: string;
  chainId?: number;
}): Promise<WriteResult> {
  try {
    const client   = getClient();
    const account  = getAccount();
    const chain    = resolveChain(params.chainId ?? 8453);
    const contract = getContract({ client, chain, address: params.contractAddress });

    const tx = erc20Burn({
      contract,
      amount: params.amount,
    });

    const receipt = await sendAndConfirmTransaction({ transaction: tx, account });
    const txHash = receipt.transactionHash;

    return {
      success: true,
      txHash,
      explorerUrl: `https://basescan.org/tx/${txHash}`,
      contractAddress: params.contractAddress,
    };
  } catch (err) {
    return {
      success: false,
      error: `ERC-20 burn failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
