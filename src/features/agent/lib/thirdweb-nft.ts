/**
 * NFT data fetching via Thirdweb SDK v5.
 * Fetches NFT metadata, ownership, and collection info from any EVM chain.
 */

import { createThirdwebClient, getContract } from "thirdweb";
import { base, mainnet, polygon, arbitrum, optimism } from "thirdweb/chains";
import {
  getNFT,
  getOwnedNFTs,
  totalSupply,
  isERC721,
} from "thirdweb/extensions/erc721";
import {
  getNFT as getNFT1155,
  getOwnedNFTs as getOwnedNFTs1155,
  isERC1155,
} from "thirdweb/extensions/erc1155";

function getClient() {
  const clientId = process.env.THIRDWEB_CLIENT_ID;
  if (!clientId) throw new Error("THIRDWEB_CLIENT_ID is not configured. Add it to .env — get a free key at thirdweb.com/dashboard");
  return createThirdwebClient({ clientId });
}

// Chain id → thirdweb chain mapping
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

export interface NFTMetadata {
  tokenId: string;
  name: string | null;
  description: string | null;
  image: string | null;
  animationUrl: string | null;
  attributes: Array<{ trait_type: string; value: string | number }>;
  owner: string | null;
  type: "ERC721" | "ERC1155" | "unknown";
}

export interface NFTResult {
  success: boolean;
  nft?: NFTMetadata;
  collection?: {
    address: string;
    chainId: number;
    totalSupply: number | null;
    type: "ERC721" | "ERC1155" | "unknown";
  };
  error?: string;
}

export interface OwnedNFTsResult {
  success: boolean;
  owner?: string;
  contractAddress?: string;
  chainId?: number;
  nfts?: NFTMetadata[];
  count?: number;
  error?: string;
}

/**
 * Fetch a single NFT's metadata and ownership.
 */
export async function getNFTData(
  contractAddress: string,
  tokenId: bigint | number,
  chainId = 8453,
): Promise<NFTResult> {
  try {
    const client = getClient();
    const chain = resolveChain(chainId);

    const contract = getContract({ client, chain, address: contractAddress });

    // Detect token standard
    let tokenType: "ERC721" | "ERC1155" | "unknown" = "unknown";
    try {
      const [is721, is1155] = await Promise.all([
        isERC721({ contract }).catch(() => false),
        isERC1155({ contract }).catch(() => false),
      ]);
      if (is721) tokenType = "ERC721";
      else if (is1155) tokenType = "ERC1155";
    } catch {
      tokenType = "ERC721"; // default assumption
    }

    const id = BigInt(tokenId);

    let nft: Awaited<ReturnType<typeof getNFT>> | null = null;
    if (tokenType === "ERC1155") {
      nft = await getNFT1155({ contract, tokenId: id });
    } else {
      nft = await getNFT({ contract, tokenId: id, includeOwner: true });
    }

    // Get total supply
    let supply: number | null = null;
    try {
      const s = await totalSupply({ contract });
      supply = Number(s);
    } catch {
      supply = null;
    }

    const attrs = (nft.metadata?.attributes as Array<{ trait_type: string; value: string | number }>) ?? [];

    return {
      success: true,
      nft: {
        tokenId: id.toString(),
        name: (nft.metadata?.name as string) ?? null,
        description: (nft.metadata?.description as string) ?? null,
        image: (nft.metadata?.image as string) ?? null,
        animationUrl: (nft.metadata?.animation_url as string) ?? null,
        attributes: attrs,
        owner: (nft as { owner?: string }).owner ?? null,
        type: tokenType,
      },
      collection: {
        address: contractAddress,
        chainId,
        totalSupply: supply,
        type: tokenType,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: `NFT fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Get all NFTs owned by a wallet in a given collection.
 */
export async function getWalletNFTs(
  ownerAddress: string,
  contractAddress: string,
  chainId = 8453,
): Promise<OwnedNFTsResult> {
  try {
    const client = getClient();
    const chain = resolveChain(chainId);
    const contract = getContract({ client, chain, address: contractAddress });

    // Detect standard
    let is1155 = false;
    try {
      is1155 = await isERC1155({ contract });
    } catch {
      is1155 = false;
    }

    const owned = is1155
      ? await getOwnedNFTs1155({ contract, address: ownerAddress })
      : await getOwnedNFTs({ contract, owner: ownerAddress });

    const nfts: NFTMetadata[] = owned.map((nft) => ({
      tokenId: nft.id.toString(),
      name: (nft.metadata?.name as string) ?? null,
      description: (nft.metadata?.description as string) ?? null,
      image: (nft.metadata?.image as string) ?? null,
      animationUrl: (nft.metadata?.animation_url as string) ?? null,
      attributes: (nft.metadata?.attributes as Array<{ trait_type: string; value: string | number }>) ?? [],
      owner: ownerAddress,
      type: is1155 ? "ERC1155" : "ERC721",
    }));

    return {
      success: true,
      owner: ownerAddress,
      contractAddress,
      chainId,
      nfts,
      count: nfts.length,
    };
  } catch (err) {
    return {
      success: false,
      error: `Owned NFTs fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
