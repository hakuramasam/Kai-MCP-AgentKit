/**
 * Thirdweb Vault + Engine Cloud signing layer.
 *
 * Replaces raw WALLET_PRIVATE_KEY with Thirdweb's secure enclave.
 * The private key never touches this server — Vault signs remotely.
 *
 * Engine Cloud endpoints used:
 *   POST https://engine.thirdweb.com/v1/write/transaction  — broadcast raw tx
 *   POST https://engine.thirdweb.com/v1/write/contract     — ABI-level call
 *
 * Auth: x-vault-access-token header (no x-secret-key needed for Vault paths)
 */

const ENGINE_BASE = "https://engine.thirdweb.com";

// ─── Config helpers ────────────────────────────────────────────────────────────

export function getVaultConfig(): { accessToken: string; accountAddress: string } | null {
  const accessToken    = process.env.THIRDWEB_VAULT_ACCESS_TOKEN;
  const accountAddress = process.env.THIRDWEB_VAULT_ACCOUNT_ADDRESS;
  if (!accessToken || !accountAddress) return null;
  return { accessToken, accountAddress };
}

export function isVaultConfigured(): boolean {
  return getVaultConfig() !== null;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VaultTxResult {
  success: boolean;
  txHash?: string;
  queueId?: string;       // Engine queues txs; queueId tracks status
  explorerUrl?: string;
  error?: string;
}

export interface VaultWriteContractResult extends VaultTxResult {
  contractAddress?: string;
}

// ─── Send a raw transaction via Vault ────────────────────────────────────────

/**
 * Broadcast a raw EVM transaction signed by the Vault-managed wallet.
 * `to`, `data`, `value` are the standard tx fields.
 * `value` should be a decimal string in wei (e.g. "0" or "1000000000000000").
 */
export async function vaultSendTransaction(params: {
  to: string;
  data: string;
  value?: string;
  chainId?: number;
}): Promise<VaultTxResult> {
  const vault = getVaultConfig();
  if (!vault) {
    return {
      success: false,
      error: "Thirdweb Vault is not configured. Add THIRDWEB_VAULT_ACCESS_TOKEN and THIRDWEB_VAULT_ACCOUNT_ADDRESS to .env.",
    };
  }

  const chainId = params.chainId ?? 8453;

  try {
    const res = await fetch(`${ENGINE_BASE}/v1/write/transaction`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-vault-access-token": vault.accessToken,
      },
      body: JSON.stringify({
        executionOptions: {
          from: vault.accountAddress,
          chainId,
        },
        params: [
          {
            to:    params.to,
            data:  params.data || "0x",
            value: params.value ?? "0",
          },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });

    const json = await res.json() as {
      result?: { transactionHash?: string; queueId?: string };
      error?: string;
      message?: string;
    };

    if (!res.ok) {
      const msg = json.error ?? json.message ?? `HTTP ${res.status}`;
      return { success: false, error: `Engine error: ${msg}` };
    }

    const txHash = json.result?.transactionHash;
    const queueId = json.result?.queueId;

    return {
      success: true,
      txHash,
      queueId,
      explorerUrl: txHash ? `https://basescan.org/tx/${txHash}` : undefined,
    };
  } catch (err) {
    return {
      success: false,
      error: `Vault send failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Call a contract function (ABI-level) via Vault.
 * `method` is the function signature, e.g. "function mint(address to, uint256 amount)".
 * `params` is an array of stringified arguments.
 */
export async function vaultWriteContract(params: {
  contractAddress: string;
  method: string;
  args: string[];
  value?: string;
  chainId?: number;
}): Promise<VaultWriteContractResult> {
  const vault = getVaultConfig();
  if (!vault) {
    return {
      success: false,
      error: "Thirdweb Vault is not configured. Add THIRDWEB_VAULT_ACCESS_TOKEN and THIRDWEB_VAULT_ACCOUNT_ADDRESS to .env.",
    };
  }

  const chainId = params.chainId ?? 8453;

  try {
    const res = await fetch(`${ENGINE_BASE}/v1/write/contract`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-vault-access-token": vault.accessToken,
      },
      body: JSON.stringify({
        executionOptions: {
          from: vault.accountAddress,
          chainId,
        },
        params: [
          {
            contractAddress: params.contractAddress,
            method:          params.method,
            params:          params.args,
            value:           params.value ?? "0",
          },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });

    const json = await res.json() as {
      result?: { transactionHash?: string; queueId?: string; contractAddress?: string };
      error?: string;
      message?: string;
    };

    if (!res.ok) {
      const msg = json.error ?? json.message ?? `HTTP ${res.status}`;
      return { success: false, error: `Engine write contract error: ${msg}` };
    }

    const txHash        = json.result?.transactionHash;
    const queueId       = json.result?.queueId;
    const contractAddr  = json.result?.contractAddress;

    return {
      success: true,
      txHash,
      queueId,
      contractAddress: contractAddr,
      explorerUrl: txHash ? `https://basescan.org/tx/${txHash}` : undefined,
    };
  } catch (err) {
    return {
      success: false,
      error: `Vault write contract failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
