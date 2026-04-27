/**
 * Thirdweb gasless signing via ERC-4337 Smart Account + Paymaster.
 *
 * Uses smartWallet({ sponsorGas: true }) so the Vault EOA never needs ETH —
 * gas is paid by Thirdweb's paymaster and billed to your Thirdweb account.
 *
 * Requirements:
 *   THIRDWEB_SECRET_KEY      — your Thirdweb secret key (enables paymaster)
 *   WALLET_PRIVATE_KEY       — the underlying EOA private key (32-byte hex)
 *
 * The smart account address is derived deterministically from the EOA.
 * All deploy and write operations go through sendAndConfirmTransaction with
 * the smart account, so gas is sponsored end-to-end.
 */

import { createThirdwebClient, sendAndConfirmTransaction } from "thirdweb";
import { base, mainnet, polygon, arbitrum, optimism } from "thirdweb/chains";
import { smartWallet, privateKeyAccount } from "thirdweb/wallets";
import type { Chain } from "thirdweb/chains";

const CHAIN_MAP: Record<number, Chain> = {
  1: mainnet, 8453: base, 137: polygon, 42161: arbitrum, 10: optimism,
};

export function resolveChain(chainId: number): Chain {
  return CHAIN_MAP[chainId] ?? base;
}

// ─── Client + gasless account factory ────────────────────────────────────────

function getGaslessClient() {
  const secretKey = process.env.THIRDWEB_SECRET_KEY;
  if (!secretKey) throw new Error("THIRDWEB_SECRET_KEY is required for gasless transactions. Add it to your environment variables.");
  return createThirdwebClient({ secretKey });
}

/**
 * Returns a connected Smart Account with sponsorGas: true.
 * The personal (EOA) account signs user ops; the paymaster covers gas.
 */
export async function getGaslessAccount(chainId = 8453) {
  const rawKey = process.env.WALLET_PRIVATE_KEY;
  if (!rawKey?.startsWith("0x") || rawKey.length !== 66) {
    throw new Error("WALLET_PRIVATE_KEY is required. Add a 32-byte hex private key to your environment variables.");
  }

  const client  = getGaslessClient();
  const chain   = resolveChain(chainId);

  // Personal (EOA) account — the "owner" of the smart account
  const personalAccount = privateKeyAccount({
    client,
    privateKey: rawKey as `0x${string}`,
  });

  // Smart wallet with gas sponsorship enabled
  const wallet = smartWallet({
    chain,
    sponsorGas: true,
  });

  const smartAccount = await wallet.connect({ client, personalAccount });
  return { smartAccount, client, chain };
}

export function isGaslessConfigured(): boolean {
  return !!(process.env.THIRDWEB_SECRET_KEY && process.env.WALLET_PRIVATE_KEY?.startsWith("0x"));
}

// ─── Re-export sendAndConfirmTransaction for convenience ──────────────────────
export { sendAndConfirmTransaction };
