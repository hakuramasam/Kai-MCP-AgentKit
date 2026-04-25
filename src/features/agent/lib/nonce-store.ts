/**
 * In-memory nonce store — prevents payment replay attacks.
 *
 * A verified (txHash, nonce) pair is stored for the duration of the
 * tx freshness window (5 minutes). Any attempt to reuse the same
 * payment proof is rejected.
 *
 * Memory is pruned every 5 minutes to stay bounded.
 */

const FRESHNESS_MS = 5 * 60 * 1000; // must match TX_FRESHNESS_MS in x402.ts

// Key: `${txHash}:${nonce}` → timestamp of first use
const usedNonces = new Map<string, number>();

/**
 * Attempt to consume a (txHash, nonce) pair.
 * Returns true if this is the FIRST use (allowed).
 * Returns false if already consumed (replay — reject).
 */
export function consumeNonce(txHash: string, nonce: string): boolean {
  const key = `${txHash.toLowerCase()}:${nonce}`;
  if (usedNonces.has(key)) return false; // already used
  usedNonces.set(key, Date.now());
  return true;
}

/** Prune entries older than the freshness window. */
export function pruneNonces(): void {
  const cutoff = Date.now() - FRESHNESS_MS;
  for (const [key, ts] of usedNonces.entries()) {
    if (ts < cutoff) usedNonces.delete(key);
  }
}

// Auto-prune every 5 minutes
if (typeof setInterval !== "undefined") {
  setInterval(pruneNonces, FRESHNESS_MS);
}
