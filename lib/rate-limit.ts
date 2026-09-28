// lib/rate-limit.ts — small in-memory fixed-window limiter (2026-09-28).
//
// Deliberately dependency-free and in-process: it guards the two endpoints that
// cost money or send mail (OTP send, full-library backup) against a single
// caller looping. It is NOT a distributed limiter — on serverless every warm
// instance keeps its own window, which is why the OTP path is also bounded by
// the database rules (one live code per address, 5 attempts, 10-minute expiry)
// and the backup is bounded by the owner scope.
//
// Cleanup: expired windows are swept periodically (every `windowMs`, plus a
// hard size cap) so a long-lived process cannot grow the Map without bound.

interface Window {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Window>();

let lastSweep = Date.now();

function sweep(now: number): void {
  for (const [key, window] of buckets) {
    if (window.resetAt <= now) buckets.delete(key);
  }
  lastSweep = now;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Requests still available inside the current window. */
  remaining: number;
  /** Seconds until the window resets (0 when allowed). */
  retryAfterSeconds: number;
}

/**
 * Count one hit against `key`. `limit` is the max number of hits allowed per
 * `windowMs`. Returns `allowed: false` once the budget is spent; the caller
 * answers 429 with `Retry-After`.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): RateLimitResult {
  if (now - lastSweep >= windowMs || buckets.size > 10_000) sweep(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: Math.max(0, limit - 1), retryAfterSeconds: 0 };
  }
  if (existing.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  existing.count += 1;
  return { allowed: true, remaining: Math.max(0, limit - existing.count), retryAfterSeconds: 0 };
}

/** Drop every window (tests + a manual reset hook). */
export function resetRateLimits(): void {
  buckets.clear();
  lastSweep = Date.now();
}

/**
 * Best-effort client address for the per-IP limits. `x-forwarded-for` is the
 * first hop as set by the platform proxy; a direct call (no proxy) falls back to
 * a shared bucket. Spoofing this header can only move a caller into a different
 * bucket — it never grants access, which is why it is acceptable here and
 * nowhere else.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}
