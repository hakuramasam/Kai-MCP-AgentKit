/**
 * Thirdweb contract deployment via Nebula AI.
 *
 * Nebula can generate, explain, and produce deployment transactions for
 * EVM smart contracts. This module wraps Nebula with a deployment-focused
 * prompt and parses out the resulting contract address / tx hash from actions.
 */

const NEBULA_BASE = "https://nebula-api.thirdweb.com";

export interface DeployResult {
  success: boolean;
  /** Human-readable answer from Nebula (deployment steps, ABI notes, etc.) */
  message?: string;
  /** On-chain deployment transaction hash if Nebula produced one */
  txHash?: string;
  /** Deployed contract address if available */
  contractAddress?: string;
  /** Raw Nebula actions (for advanced callers) */
  actions?: Array<{ type: string; data: unknown }>;
  /** Thirdweb dashboard link */
  dashboardUrl?: string;
  error?: string;
}

/**
 * Ask Nebula AI to help deploy a smart contract on Base (or another EVM chain).
 *
 * Nebula understands contract templates (ERC-20, ERC-721, ERC-1155, custom),
 * generates deployment calldata, and can explain the resulting ABI.
 * For write operations (actual on-chain deploy), the caller's wallet must sign
 * the transaction — Nebula returns the tx payload, not the final hash.
 */
export async function deployContract(params: {
  description: string;       // e.g. "an ERC-721 NFT collection called CoolCats"
  contractType?: string;     // e.g. "ERC-721", "ERC-20", "ERC-1155", "custom"
  name?: string;             // token name
  symbol?: string;           // token symbol
  chainId?: number;          // defaults to 8453 (Base)
  walletAddress?: string;    // deployer wallet (provides context to Nebula)
  extraParams?: string;      // any other details (supply, royalties, etc.)
}): Promise<DeployResult> {
  const secretKey = process.env.THIRDWEB_SECRET_KEY;
  if (!secretKey) {
    return {
      success: false,
      error: "THIRDWEB_SECRET_KEY is not configured. Add it to .env — get a free key at thirdweb.com/dashboard",
    };
  }

  const chainId = params.chainId ?? 8453;
  const chainName = chainId === 8453 ? "Base Mainnet" : `chain ${chainId}`;
  const contractType = params.contractType ?? "smart contract";

  // Build a rich deployment prompt for Nebula
  const parts = [
    `I want to deploy a ${contractType} on ${chainName}.`,
    `Description: ${params.description}`,
    params.name   ? `Token name: ${params.name}`   : null,
    params.symbol ? `Token symbol: ${params.symbol}` : null,
    params.extraParams ? params.extraParams : null,
    "Please provide: the deployment steps, constructor parameters, estimated gas, and the deployment transaction data.",
    "If you can produce a deploy transaction, include it in your actions.",
  ].filter(Boolean).join(" ");

  try {
    const body: Record<string, unknown> = {
      message: parts,
      stream: false,
      context: {
        chain_ids: [String(chainId)],
        ...(params.walletAddress ? { wallet_address: params.walletAddress } : {}),
      },
    };

    const res = await fetch(`${NEBULA_BASE}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-secret-key": secretKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { success: false, error: `Nebula API error ${res.status}: ${text.slice(0, 300)}` };
    }

    const data = (await res.json()) as {
      message?: string;
      actions?: Array<{ type: string; data: Record<string, unknown> }>;
      session_id?: string;
    };

    // Extract tx hash / contract address from actions if present
    let txHash: string | undefined;
    let contractAddress: string | undefined;

    for (const action of data.actions ?? []) {
      const d = action.data ?? {};
      if (typeof d.transaction_hash === "string") txHash = d.transaction_hash;
      if (typeof d.contract_address === "string") contractAddress = d.contract_address;
      if (typeof d.to === "string" && !contractAddress) contractAddress = d.to;
    }

    const dashboardUrl = contractAddress
      ? `https://thirdweb.com/${chainId}/${contractAddress}`
      : `https://thirdweb.com/dashboard/contracts/deploy`;

    return {
      success: true,
      message: data.message ?? "",
      txHash,
      contractAddress,
      actions: data.actions ?? [],
      dashboardUrl,
    };
  } catch (err) {
    return {
      success: false,
      error: `Deploy request failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
