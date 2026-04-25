/**
 * In-memory sliding window rate limiter for A2A and MCP endpoints.
 *
 * Two tiers:
 *   - IP-based  : 60 requests / minute  (anonymous / unpaid callers)
 *   - Address   : 300 requests / minute  (callers who have paid on-chain)
 *
 * Each bucket stores timestamps of requests within the window.
 * Stale entries are pruned on every check to keep memory bounded.
 */

// ─── Config ───────────────────────────────────────────────────────────────────

const WINDOW_MS = 60_000; // 1 minute sliding window

export const RATE_LIMITS = {
  ip: 60,       // requests per minute per IP (unauthenticated)
  address: 300, // requests per minute per paying ETH address
} as const;

// ─── Storage ──────────────────────────────────────────────────────────────────

// Map<key, sorted array of request timestamps>
const buckets = new Map<string, number[]>();

// ─── Core logic ───────────────────────────────────────────────────────────────

/**
 * Record a request and check whether the key is within its limit.
 *
 * @param key       Bucket key (e.g. "ip:1.2.3.4" or "addr:0xabc...")
 * @param limit     Maximum requests allowed in the window
 * @returns         { allowed, remaining, resetAt }
 */
export function checkRateLimit(
  key: string,
  limit: number,
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  // Get or create bucket
  let timestamps = buckets.get(key) ?? [];

  // Prune entries outside the window
  timestamps = timestamps.filter((t) => t > windowStart);

  const count = timestamps.length;

  if (count >= limit) {
    // Oldest timestamp in window tells us when a slot opens
    const resetAt = (timestamps[0] ?? now) + WINDOW_MS;
    buckets.set(key, timestamps);
    return { allowed: false, remaining: 0, resetAt };
  }

  // Record this request
  timestamps.push(now);
  buckets.set(key, timestamps);

  return {
    allowed: true,
    remaining: limit - timestamps.length,
    resetAt: now + WINDOW_MS,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extract the real client IP from Next.js request headers. */
export function getClientIp(req: Request): string {
  const headers = req.headers as Headers;
  return (
    headers.get("x-real-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;   // ms epoch
  limitedBy: "ip" | "address" | null;
}

/**
 * Check rate limits for an A2A / MCP request.
 *
 * If `payingAddress` is provided the caller has proven on-chain payment,
 * so they get the more generous address-level limit instead of (not in
 * addition to) the IP limit.
 */
export function enforceRateLimit(
  req: Request,
  payingAddress?: string,
): RateLimitResult {
  const ip = getClientIp(req);

  if (payingAddress) {
    const addrKey = `addr:${payingAddress.toLowerCase()}`;
    const result = checkRateLimit(addrKey, RATE_LIMITS.address);
    return { ...result, limitedBy: result.allowed ? null : "address" };
  }

  const ipKey = `ip:${ip}`;
  const result = checkRateLimit(ipKey, RATE_LIMITS.ip);
  return { ...result, limitedBy: result.allowed ? null : "ip" };
}

/** Prune all stale buckets (call periodically to prevent memory leak). */
export function pruneExpiredBuckets(): void {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  for (const [key, timestamps] of buckets.entries()) {
    const fresh = timestamps.filter((t) => t > windowStart);
    if (fresh.length === 0) {
      buckets.delete(key);
    } else {
      buckets.set(key, fresh);
    }
  }
}

// Auto-prune every 5 minutes so the map doesn't grow unbounded
if (typeof setInterval !== "undefined") {
  setInterval(pruneExpiredBuckets, 5 * 60_000);
}
