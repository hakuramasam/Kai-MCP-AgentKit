"use client";

/**
 * TokenGatedFeature — wraps any content behind a token/NFT ownership check.
 *
 * Usage:
 *   <TokenGatedFeature
 *     wallet={userWallet}
 *     contract="0x..."
 *     type="ERC-721"
 *     lockedTitle="Holder-only feature"
 *     lockedDescription="Hold at least 1 NFT to access this."
 *   >
 *     <YourGatedContent />
 *   </TokenGatedFeature>
 */

import { useTokenGate } from "@/features/agent/hooks/use-token-gate";
import type { UseTokenGateConfig } from "@/features/agent/hooks/use-token-gate";

interface TokenGatedFeatureProps extends UseTokenGateConfig {
  children: React.ReactNode;
  /** Title shown on the locked state card */
  lockedTitle?: string;
  /** Description shown on the locked state card */
  lockedDescription?: string;
  /** Custom locked state — overrides the default card */
  lockedFallback?: React.ReactNode;
  /** Show a loading skeleton while checking */
  loadingFallback?: React.ReactNode;
}

export function TokenGatedFeature({
  children,
  lockedTitle = "Token-gated feature",
  lockedDescription,
  lockedFallback,
  loadingFallback,
  ...gateConfig
}: TokenGatedFeatureProps) {
  const gate = useTokenGate(gateConfig);

  if (!gateConfig.wallet) {
    return <WalletRequired />;
  }

  if (gate.loading) {
    if (loadingFallback) return <>{loadingFallback}</>;
    return <GateLoading />;
  }

  if (!gate.allowed) {
    if (lockedFallback) return <>{lockedFallback}</>;
    return (
      <LockedState
        title={lockedTitle}
        description={
          lockedDescription ??
          buildDefaultDescription(gateConfig)
        }
        result={gate.result}
        error={gate.error}
        onRetry={gate.refresh}
      />
    );
  }

  return <>{children}</>;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function GateLoading() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 px-6 text-center">
      <div className="w-10 h-10 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
      <p className="text-sm text-gray-400">Checking token ownership...</p>
    </div>
  );
}

function WalletRequired() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center text-2xl">
        🔗
      </div>
      <p className="font-semibold text-white">Wallet not connected</p>
      <p className="text-sm text-gray-400 max-w-xs">
        Connect a wallet via your Farcaster account to access this feature.
      </p>
    </div>
  );
}

interface LockedStateProps {
  title: string;
  description: string;
  result: ReturnType<typeof useTokenGate>["result"];
  error: string | null;
  onRetry: () => void;
}

function LockedState({ title, description, result, error, onRetry }: LockedStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-10 px-6 text-center">
      {/* Lock icon */}
      <div className="relative">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-900/50 to-purple-900/50 border border-violet-500/20 flex items-center justify-center text-3xl">
          🔒
        </div>
      </div>

      {/* Text */}
      <div className="space-y-1.5">
        <h3 className="font-bold text-white text-base">{title}</h3>
        <p className="text-sm text-gray-400 max-w-xs leading-relaxed">{description}</p>
      </div>

      {/* Balance info */}
      {result && !error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs">
          <span className="text-gray-500">Your balance:</span>
          <span className="text-white font-medium">{result.balanceFormatted}</span>
          {result.tokenSymbol && <span className="text-violet-400">{result.tokenSymbol}</span>}
          <span className="text-gray-600">•</span>
          <span className="text-gray-500">Required:</span>
          <span className="text-white font-medium">{result.minRequired}</span>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-300 max-w-xs">
          {error}
        </div>
      )}

      {/* Contract chip */}
      {result?.contractAddress && (
        <a
          href={`https://basescan.org/token/${result.contractAddress}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-violet-400 hover:text-violet-300 underline-offset-2 hover:underline transition-colors"
        >
          View contract on Basescan ↗
        </a>
      )}

      {/* Retry */}
      <button
        onClick={onRetry}
        className="mt-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
      >
        Re-check ownership
      </button>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildDefaultDescription(cfg: UseTokenGateConfig): string {
  const min = cfg.minBalance ?? "1";
  const chain = cfg.chainId === 1 ? "Ethereum" : cfg.chainId === 137 ? "Polygon" : "Base";
  const typeLabel = cfg.type === "ERC-20" ? "tokens" : "NFTs";

  if (cfg.type === "ERC-1155") {
    return `Hold at least ${min} of token #${cfg.tokenId ?? 0} from this ERC-1155 collection on ${chain} to unlock this feature.`;
  }
  return `Hold at least ${min} ${typeLabel} from this ${cfg.type} contract on ${chain} to unlock this feature.`;
}
