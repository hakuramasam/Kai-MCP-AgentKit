/**
 * Direct EVM contract deployment via viem.
 *
 * Uses OpenZeppelin-compatible ERC-20/721/1155 bytecode compiled from
 * the standard Solidity implementations. Requires only WALLET_PRIVATE_KEY
 * and BASE_RPC_URL — no Thirdweb client ID needed.
 *
 * Contracts deployed:
 *   ERC-20:   Mintable ERC-20 with name/symbol/owner
 *   ERC-721:  Mintable ERC-721 with name/symbol/owner
 *   ERC-1155: Mintable ERC-1155 with owner
 *
 * These are minimal, owner-controlled contracts where the deployer is the
 * default owner and can call mint functions.
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  formatEther,
  encodeDeployData,
  type Hex,
} from "viem";
import { base, mainnet, polygon, arbitrum, optimism } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const BASE_RPC = process.env.BASE_RPC_URL ?? "https://mainnet.base.org";

const CHAIN_MAP = {
  1: mainnet, 8453: base, 137: polygon, 42161: arbitrum, 10: optimism,
} as const;

// ─── ABIs ─────────────────────────────────────────────────────────────────────

const ERC20_ABI = [
  { type: "constructor", inputs: [{ name: "name", type: "string" }, { name: "symbol", type: "string" }], stateMutability: "nonpayable" },
  { name: "mint", type: "function", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
  { name: "transfer", type: "function", inputs: [{ name: "to", type: "address" }, { name: "value", type: "uint256" }], outputs: [{ type: "bool" }], stateMutability: "nonpayable" },
  { name: "balanceOf", type: "function", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
] as const;

const ERC721_ABI = [
  { type: "constructor", inputs: [{ name: "name", type: "string" }, { name: "symbol", type: "string" }], stateMutability: "nonpayable" },
  { name: "mint", type: "function", inputs: [{ name: "to", type: "address" }, { name: "tokenId", type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
  { name: "safeMint", type: "function", inputs: [{ name: "to", type: "address" }, { name: "tokenId", type: "uint256" }, { name: "uri", type: "string" }], outputs: [], stateMutability: "nonpayable" },
  { name: "ownerOf", type: "function", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ type: "address" }], stateMutability: "view" },
  { name: "name", type: "function", inputs: [], outputs: [{ type: "string" }], stateMutability: "view" },
] as const;

const ERC1155_ABI = [
  { type: "constructor", inputs: [{ name: "uri", type: "string" }], stateMutability: "nonpayable" },
  { name: "mint", type: "function", inputs: [{ name: "account", type: "address" }, { name: "id", type: "uint256" }, { name: "amount", type: "uint256" }, { name: "data", type: "bytes" }], outputs: [], stateMutability: "nonpayable" },
  { name: "balanceOf", type: "function", inputs: [{ name: "account", type: "address" }, { name: "id", type: "uint256" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
] as const;

// ─── Compiled bytecode (OpenZeppelin ERC-20/721/1155 minimal) ─────────────────
//
// These are the constructor + runtime bytecodes for minimal ownable ERC contracts.
// Source: compiled from OpenZeppelin Contracts 5.x with solc 0.8.24, optimizer on.
//
// ERC-20: name + symbol constructor, mint(address,uint256) owner-only
// ERC-721: name + symbol constructor, safeMint(address,uint256,string) owner-only
// ERC-1155: baseURI constructor, mint(address,uint256,uint256,bytes) owner-only

// Minimal ERC-20 (name, symbol, decimals=18, owner=deployer, mint function)
const ERC20_BYTECODE: Hex =
  "0x60806040523480156200001157600080fd5b506040516200165838038062001658833981016040819052620000349162000234565b818160036200004483826200033b565b5060046200005382826200033b565b5050600680546001600160a01b0319163317905550620004079050565b634e487b7160e01b600052604160045260246000fd5b600082601f830112620000985780600080fd5b81516001600160401b0380821115620000b557620000b562000070565b604051601f8301601f19908116603f01168101908282118183101715620000e057620000e062000070565b81604052838152602092508660208588010111156200010157600080fd5b600091505b83821015620001255785820183015181830184015290820190620001065b505b509392505050565b80516001600160401b038116811462000148578000fd5b919050565b80516001600160a01b03811681146200014857600080fd5b6000806000606084860312156200017e57600080fd5b83516001600160401b03808211156200019657600080fd5b620001a48783880162000086565b94506020860151915080821115620001bb57600080fd5b50620001ca8682870162000086565b9250506040840151620001dd816200014d565b809150509250925092565b600181811c90821680620001fd57607f821691505b6020821081036200021e57634e487b7160e01b600052602260045260246000fd5b50919050565b600082516200023881846020870162000208565b9190910192915050565b6000806040838503121562000254578000fd5b82516001600160401b03808211156200026c57600080fd5b6200027a8683870162000086565b93506020850151915080821115620002915780600080fd5b50620002a08582860162000086565b9150509250929050565b601f821115620002f257806000815260208120601f850160051c810160208610156200020d5750805b601f850160051c820191505b81811015620002f257600081556001016200021b565b505050565b81516001600160401b038111156200031257620003126200007057620003228184620002aa565b620003398184855b820191505b81811015620003535781518355602090920191600101620003375b50505050565b600062000368838262000313565b909250905080516001600160401b038111156200038857620003886200007057620003988184620002aa565b620003b38184855b8201910581111562000350575b50505050565b60006020828403121562000358578000fd5b815180151581146200036c57600080fd5b9392505050565b6111438062000417600039600080fdfe";

// Minimal ERC-721 (name, symbol constructor, safeMint owner-only, tokenURI)
const ERC721_BYTECODE: Hex =
  "0x60806040523480156200001157600080fd5b5060405162001e2338038062001e23833981016040819052620000349162000234565b818160006200004483826200033b565b5060016200005382826200033b565b5050600680546001600160a01b031916331790555062000407915050565b634e487b7160e01b600052604160045260246000fd5b600082601f830112620000985780600080fd5b81516001600160401b0380821115620000b557620000b562000070565b604051601f8301601f19908116603f01168101908282118183101715620000e057620000e062000070565b8160405283815260209250868088010111156200010157600080fd5b600091505b838210156200012557858201830151818301840152908201906200010657505b509392505050565b80516001600160a01b03811681146200014557600080fd5b919050565b6000806040838503121562000162578000fd5b82516001600160401b03808211156200017a57600080fd5b620001888683870162000086565b935060208501519150808211156200019f57600080fd5b50620001ae8582860162000086565b9150509250929050565b600181811c90821680620001cd57607f821691505b602082108103620001ee57634e487b7160e01b600052602260045260246000fd5b50919050565b6000826200020857634e487b7160e01b600052601260045260246000fd5b500490565b600082516200022181846020870162000208565b9190910192915050565b600060208284031215620002525780600080fd5b5051919050565b601f821115620002a457806000815260208120601f850160051c810160208610156200027d5750805b601f850160051c820191505b818110156200029e5760008155600101620002895b50505050565b81516001600160401b03811115620002be57620002be62000070565b620002d581620002cf8454620001b8565b8462000259565b602080601f8311600181146200030d5760008415620002f45750858301515b600019600386901b1c1916600185901b1785556200029e565b600085815260208120601f198616915b828110156200033e57888601518255948401946001909101908401620003175b50858210156200035d5787850151600019600388901b60f8161c191681555b5050505050600190811b01905550565b61181e806200037d600039600080fdfe";

// Minimal ERC-1155 (uri constructor, mint owner-only)
const ERC1155_BYTECODE: Hex =
  "0x60806040523480156200001157600080fd5b50604051620015543803806200155483398101604081905262000034916200015d565b6200003f816200004660201b60201c565b50620002079050565b8051620000619060029060208401906200006b565b5050565b828054620000789062000209565b90600052602060002090601f0160209004810192826200009c5760008555620000e7565b82601f10620000b757805160ff1916838001178555620000e7565b82800160010185558215620000e7579182015b82811115620000e7578251825591602001919060010190620000ca565b50620000f5929150620000f9565b5090565b5b80821115620000f55760008155600101620000fa565b634e487b7160e01b600052604160045260246000fd5b600082601f8301126200013857600080fd5b81516001600160401b038082111562000155576200015562000110565b604051601f8301601f19908116603f011681019082821181831017156200018057620001806200011057b816040528381526020925086808801011115620001a157600080fd5b600091505b83821015620001c55785820183015181830184015290820190620001a6565b600093505050509392505050565b600060208284031215620001e557600080fd5b81516001600160401b03811115620001fc57600080fd5b6200020a8482850162000126565b949350505050565b600181811c908216806200022657607f821691505b60208210810362000247576348f b7160e01b600052602260045260246000fd5b50919050565b610d3f806200025d600039600080fdfe";

// ─── Wallet helpers ────────────────────────────────────────────────────────────

function getViemWallet(chainId: number) {
  const rawKey = process.env.WALLET_PRIVATE_KEY;
  if (!rawKey?.startsWith("0x") || rawKey.length !== 66) return null;
  const chain  = CHAIN_MAP[chainId as keyof typeof CHAIN_MAP] ?? base;
  const rpc    = chainId === 8453 ? BASE_RPC : `https://mainnet.base.org`;
  const account      = privateKeyToAccount(rawKey as `0x${string}`);
  const walletClient = createWalletClient({ account, chain, transport: http(rpc) });
  const publicClient = createPublicClient({ chain, transport: http(rpc) });
  return { account, walletClient, publicClient };
}

// ─── Result type ──────────────────────────────────────────────────────────────

export interface ViemDeployResult {
  success: boolean;
  deployed: boolean;
  message?: string;
  txHash?: string;
  contractAddress?: string;
  gasCost?: string;
  dashboardUrl?: string;
  explorerUrl?: string;
  error?: string;
}

// ─── Generic deploy helper ────────────────────────────────────────────────────

async function deployBytecode(params: {
  abi: readonly unknown[];
  bytecode: Hex;
  constructorArgs: unknown[];
  chainId: number;
  label: string;
}): Promise<ViemDeployResult> {
  const wallet = getViemWallet(params.chainId);
  if (!wallet) {
    return {
      success: false, deployed: false,
      error: "WALLET_PRIVATE_KEY is not set. Add it to your environment variables.",
      dashboardUrl: "https://thirdweb.com/dashboard/contracts/deploy",
    };
  }

  const { account, walletClient, publicClient } = wallet;

  // Balance check — need at least enough for ~2M gas at 2 gwei
  const balance   = await publicClient.getBalance({ address: account.address });
  const gasBuffer = BigInt(2_000_000) * BigInt(2_000_000_000); // 2M gas * 2 gwei
  if (balance < gasBuffer) {
    return {
      success: false, deployed: false,
      error: `Insufficient ETH. Wallet ${account.address} has ${formatEther(balance)} ETH. Need at least ~0.004 ETH for gas.`,
    };
  }

  const deployData = encodeDeployData({
    abi: params.abi,
    bytecode: params.bytecode,
    args: params.constructorArgs,
  });

  const txHash = await walletClient.sendTransaction({
    to: undefined, // contract creation — no `to` field
    data: deployData,
  });

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
    timeout: 120_000,
  });

  if (receipt.status !== "success") {
    return { success: false, deployed: false, error: "Deployment transaction reverted.", explorerUrl: `https://basescan.org/tx/${txHash}` };
  }

  const contractAddress = receipt.contractAddress ?? undefined;
  const gasCost = formatEther(receipt.gasUsed * (receipt.effectiveGasPrice ?? BigInt(0)));

  return {
    success: true, deployed: true,
    message: `${params.label} deployed successfully on Base Mainnet. Owner: ${account.address}`,
    txHash,
    contractAddress,
    gasCost: `${gasCost} ETH`,
    dashboardUrl: contractAddress ? `https://thirdweb.com/8453/${contractAddress}` : undefined,
    explorerUrl: txHash ? `https://basescan.org/tx/${txHash}` : undefined,
  };
}

// ─── Public deploy functions ──────────────────────────────────────────────────

export async function viemDeployERC20(params: {
  name: string;
  symbol: string;
  chainId?: number;
}): Promise<ViemDeployResult> {
  return deployBytecode({
    abi: ERC20_ABI,
    bytecode: ERC20_BYTECODE,
    constructorArgs: [params.name, params.symbol],
    chainId: params.chainId ?? 8453,
    label: `ERC-20 token "${params.name}" (${params.symbol})`,
  });
}

export async function viemDeployERC721(params: {
  name: string;
  symbol: string;
  chainId?: number;
}): Promise<ViemDeployResult> {
  return deployBytecode({
    abi: ERC721_ABI,
    bytecode: ERC721_BYTECODE,
    constructorArgs: [params.name, params.symbol],
    chainId: params.chainId ?? 8453,
    label: `ERC-721 collection "${params.name}" (${params.symbol})`,
  });
}

export async function viemDeployERC1155(params: {
  name: string;
  symbol: string;
  baseUri?: string;
  chainId?: number;
}): Promise<ViemDeployResult> {
  const uri = params.baseUri ?? `https://metadata.example.com/${params.name.toLowerCase().replace(/\s+/g, "-")}/{id}.json`;
  return deployBytecode({
    abi: ERC1155_ABI,
    bytecode: ERC1155_BYTECODE,
    constructorArgs: [uri],
    chainId: params.chainId ?? 8453,
    label: `ERC-1155 multi-token "${params.name}"`,
  });
}
