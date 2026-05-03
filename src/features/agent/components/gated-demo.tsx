"use client";

/**
 * GatedDemo — interactive UI for configuring and testing token gates.
 * Lets the creator (or any user with a wallet) enter a contract address,
 * choose a token type, and see live gate status for their wallet.
 */

import { useState } from "react";
import { cn } from "@neynar/ui";
import { useTokenGate } from "@/features/agent/hooks/use-token-gate";
import { TokenGatedFeature } from "@/features/agent/components/token-gated-feature";
import type { TokenType } from "@/features/agent/lib/token-gate";

// ─── Well-known Base tokens for quick-pick ────────────────────────────────────

const PRESETS = [
  { label: "USDC", contract: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", type: "ERC-20" as TokenType, minBalance: "1" },
  { label: "Degen", contract: "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed", type: "ERC-20" as TokenType, minBalance: "1" },
  { label: "Base Fren", contract: "0xD4307E0aCD12CF46fD6cf93BC264f5D5D1598792", type: "ERC-721" as TokenType, minBalance: "1" },
] as const;

interface GatedDemoProps {
  walletAddress?: string;
}

export function GatedDemo({ walletAddress }: GatedDemoProps) {
  const [contract, setContract] = useState("");
  const [type, setType] = useState<TokenType>("ERC-721");
  const [minBalance, setMinBalance] = useState("1");
  const [tokenId, setTokenId] = useState("");
  const [activeContract, setActiveContract] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<TokenType>("ERC-721");
  const [activeMin, setActiveMin] = useState("1");
  const [activeTokenId, setActiveTokenId] = useState<number | undefined>(undefined);
  const [checked, setChecked] = useState(false);

  function applyPreset(p: typeof PRESETS[number]) {
    setContract(p.contract);
    setType(p.type);
    setMinBalance(p.minBalance);
    setTokenId("");
  }

  function handleCheck() {
    if (!contract.trim()) return;
    setActiveContract(contract.trim());
    setActiveType(type);
    setActiveMin(minBalance);
    setActiveTokenId(tokenId ? parseInt(tokenId, 10) : undefined);
    setChecked(true);
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h2 className="text-white font-bold text-base">Token Gate Tester</h2>
        <p className="text-gray-400 text-xs leading-relaxed">
          Enter any ERC-20, ERC-721, or ERC-1155 contract address and check if your wallet passes the gate.
        </p>
      </div>

      {/* Connected wallet chip */}
      {walletAddress ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <div className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="text-xs text-emerald-300 font-mono truncate">{walletAddress}</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-xs text-amber-300">No wallet linked — connect one via Farcaster</span>
        </div>
      )}

      {/* Quick presets */}
      <div className="flex flex-col gap-1.5">
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Quick picks</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.contract}
              onClick={() => applyPreset(p)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 border border-white/10 text-gray-300 hover:bg-violet-500/20 hover:border-violet-500/40 hover:text-violet-300 transition-colors"
            >
              {p.label} ({p.type})
            </button>
          ))}
        </div>
      </div>

      {/* Config form */}
      <div className="flex flex-col gap-3 p-4 rounded-xl bg-white/5 border border-white/10">
        {/* Contract address */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400 font-medium">Contract address</label>
          <input
            value={contract}
            onChange={(e) => setContract(e.target.value)}
            placeholder="0x..."
            className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-violet-500/50 font-mono"
          />
        </div>

        {/* Token type */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400 font-medium">Token type</label>
          <div className="flex gap-2">
            {(["ERC-721", "ERC-20", "ERC-1155"] as TokenType[]).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={cn(
                  "flex-1 py-2 rounded-lg text-xs font-medium border transition-colors",
                  type === t
                    ? "bg-violet-600 border-violet-500 text-white"
                    : "bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/10",
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Min balance + ERC-1155 token ID */}
        <div className="flex gap-3">
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs text-gray-400 font-medium">Min balance</label>
            <input
              value={minBalance}
              onChange={(e) => setMinBalance(e.target.value)}
              type="number"
              min="0"
              step="any"
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-violet-500/50"
            />
          </div>
          {type === "ERC-1155" && (
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-xs text-gray-400 font-medium">Token ID</label>
              <input
                value={tokenId}
                onChange={(e) => setTokenId(e.target.value)}
                type="number"
                min="0"
                placeholder="0"
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-violet-500/50"
              />
            </div>
          )}
        </div>

        <button
          onClick={handleCheck}
          disabled={!contract.trim() || !walletAddress}
          className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
        >
          Check gate
        </button>
      </div>

      {/* Result */}
      {checked && activeContract && (
        <GateResult
          wallet={walletAddress}
          contract={activeContract}
          type={activeType}
          minBalance={activeMin}
          tokenId={activeTokenId}
        />
      )}

      {/* Demo: gated content block */}
      {checked && activeContract && walletAddress && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Gated content preview</p>
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <TokenGatedFeature
              wallet={walletAddress}
              contract={activeContract}
              type={activeType}
              minBalance={activeMin}
              tokenId={activeTokenId}
              lockedTitle="Holder-only zone"
              lockedDescription={`You need to hold the required tokens on Base to see this content.`}
            >
              <div className="flex flex-col items-center gap-3 py-8 px-4 text-center bg-gradient-to-br from-violet-900/20 to-purple-900/20">
                <div className="text-3xl">🎉</div>
                <p className="font-bold text-white">Access granted!</p>
                <p className="text-sm text-gray-300">
                  This content is only visible to verified token holders.
                </p>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span className="text-xs text-emerald-300 font-medium">Gate passed</span>
                </div>
              </div>
            </TokenGatedFeature>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Live gate result card ────────────────────────────────────────────────────

interface GateResultProps {
  wallet?: string;
  contract: string;
  type: TokenType;
  minBalance: string;
  tokenId?: number;
}

function GateResult({ wallet, contract, type, minBalance, tokenId }: GateResultProps) {
  const gate = useTokenGate({ wallet, contract, type, minBalance, tokenId });

  if (gate.loading) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 border border-white/10">
        <div className="w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
        <span className="text-sm text-gray-400">Checking on-chain...</span>
      </div>
    );
  }

  if (gate.error) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20">
        <span className="text-lg">❌</span>
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-red-300 font-medium">Check failed</span>
          <span className="text-xs text-red-400">{gate.error}</span>
        </div>
      </div>
    );
  }

  const r = gate.result;
  if (!r) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-xl border",
        r.allowed
          ? "bg-emerald-500/10 border-emerald-500/20"
          : "bg-red-500/10 border-red-500/20",
      )}
    >
      <span className="text-xl flex-shrink-0">{r.allowed ? "✅" : "🚫"}</span>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className={cn("text-sm font-semibold", r.allowed ? "text-emerald-300" : "text-red-300")}>
          {r.allowed ? "Access allowed" : "Access denied"}
        </span>
        <span className="text-xs text-gray-400 truncate">
          Balance: <span className="text-white">{r.balanceFormatted}</span>
          {r.tokenSymbol && <span className="text-violet-400"> {r.tokenSymbol}</span>}
          {r.tokenName && <span className="text-gray-500"> ({r.tokenName})</span>}
          <span className="text-gray-600"> / required: </span>
          <span className="text-white">{r.minRequired}</span>
        </span>
      </div>
      <button
        onClick={gate.refresh}
        className="ml-auto flex-shrink-0 text-gray-600 hover:text-gray-300 transition-colors text-xs"
        title="Refresh"
      >
        ↻
      </button>
    </div>
  );
}
