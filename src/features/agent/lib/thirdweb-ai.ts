/**
 * Thirdweb Nebula AI — natural language blockchain queries.
 * Trained on contracts and transactions across 2500+ EVM networks.
 * Answers questions like "explain this wallet", "what does this contract do",
 * "summarize recent activity for 0x...", "what is the USDC contract on Base?"
 */

const NEBULA_BASE = "https://nebula-api.thirdweb.com";

export function isNebulaConfigured(): boolean {
  return Boolean(process.env.THIRDWEB_SECRET_KEY);
}

export interface NebulaMessage {
  role: "user" | "assistant";
  content: string;
}

export interface NebulaResponse {
  success: boolean;
  message?: string;
  actions?: Array<{
    type: string;
    data: unknown;
  }>;
  sessionId?: string;
  error?: string;
}

/**
 * Send a natural-language blockchain question to Thirdweb Nebula.
 * Optionally pass context (wallet address, chain, contract) to ground the query.
 */
export async function queryNebula(
  prompt: string,
  context?: {
    walletAddress?: string;
    chainId?: number;
    contractAddress?: string;
    sessionId?: string;
  },
): Promise<NebulaResponse> {
  const secretKey = process.env.THIRDWEB_SECRET_KEY;
  if (!secretKey) {
    return {
      success: false,
      error:
        "THIRDWEB_SECRET_KEY is not configured. Get a free key at thirdweb.com/dashboard and add it to .env",
    };
  }

  try {
    const body: Record<string, unknown> = {
      message: prompt,
      stream: false,
    };

    // Attach context if provided
    if (context?.walletAddress || context?.chainId || context?.contractAddress) {
      body.context = {
        ...(context.walletAddress ? { wallet_address: context.walletAddress } : {}),
        ...(context.chainId ? { chain_ids: [String(context.chainId)] } : {}),
        ...(context.contractAddress ? { contract_addresses: [context.contractAddress] } : {}),
      };
    }

    if (context?.sessionId) {
      body.session_id = context.sessionId;
    }

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
      return {
        success: false,
        error: `Nebula API error ${res.status}: ${text.slice(0, 300)}`,
      };
    }

    const data = (await res.json()) as {
      message?: string;
      actions?: Array<{ type: string; data: unknown }>;
      session_id?: string;
    };

    return {
      success: true,
      message: data.message ?? "",
      actions: data.actions ?? [],
      sessionId: data.session_id,
    };
  } catch (err) {
    return {
      success: false,
      error: `Nebula request failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
