"use client";

/**
 * useTokenGate — hook to check if the current Farcaster user's connected wallet
 * holds a specific token/NFT.
 *
 * Usage:
 *   const gate = useTokenGate({
 *     wallet: user.verifiedAddresses?.[0],
 *     contract: "0x...",
 *     type: "ERC-721",
 *   });
 *
 *   if (gate.loading) return <Spinner />;
 *   if (!gate.allowed) return <LockedState />;
 *   return <GatedContent />;
 */

import { useState, useEffect, useCallback } from "react";
import type { GateCheckResult, TokenType } from "@/features/agent/lib/token-gate";

export interface UseTokenGateConfig {
  /** Wallet address to check (undefined = skip check) */
  wallet?: string;
  /** Token contract address */
  contract: string;
  /** Token standard */
  type: TokenType;
  /** Chain ID, defaults to 8453 (Base) */
  chainId?: number;
  /** ERC-1155 token ID */
  tokenId?: number;
  /** Minimum balance required, defaults to "1" */
  minBalance?: string;
  /** Auto-refresh interval in ms (0 = no refresh) */
  refreshIntervalMs?: number;
}

export interface UseTokenGateResult {
  loading: boolean;
  allowed: boolean | null;
  result: GateCheckResult | null;
  error: string | null;
  /** Manually re-check */
  refresh: () => void;
}

export function useTokenGate(config: UseTokenGateConfig): UseTokenGateResult {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GateCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async () => {
    if (!config.wallet || !config.contract) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        wallet: config.wallet,
        contract: config.contract,
        type: config.type,
        chainId: String(config.chainId ?? 8453),
        minBalance: config.minBalance ?? "1",
      });
      if (config.tokenId !== undefined) {
        params.set("tokenId", String(config.tokenId));
      }
      const res = await fetch(`/api/token-gate/check?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as GateCheckResult;
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [config.wallet, config.contract, config.type, config.chainId, config.tokenId, config.minBalance]);

  useEffect(() => {
    void check();
  }, [check]);

  useEffect(() => {
    const interval = config.refreshIntervalMs ?? 0;
    if (!interval) return;
    const id = setInterval(() => { void check(); }, interval);
    return () => clearInterval(id);
  }, [check, config.refreshIntervalMs]);

  return {
    loading,
    allowed: result?.allowed ?? null,
    result,
    error,
    refresh: check,
  };
}
