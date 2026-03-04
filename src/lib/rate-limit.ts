interface RateLimitEntry {
  count: number
  resetAt: number
}

// Persist the store on globalThis so it survives Next.js hot-reloads in dev.
// NOTE: This is still per-instance. For distributed/serverless deployments with
// multiple instances, replace with Upstash Redis (@upstash/ratelimit).
const g = globalThis as typeof globalThis & {
  _rateLimitStore?: Map<string, RateLimitEntry>
}
if (!g._rateLimitStore) {
  g._rateLimitStore = new Map<string, RateLimitEntry>()
}
const store = g._rateLimitStore

/**
 * Simple in-memory rate limiter (per key, fixed window).
 * Best-effort for single-instance deployments.
 *
 * @returns true if the request is allowed, false if rate limit exceeded
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): boolean {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now >= entry.resetAt) {
    // Opportunistic cleanup: remove all expired entries when a new window starts
    for (const [k, v] of store.entries()) {
      if (now >= v.resetAt) store.delete(k)
    }
    store.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }

  if (entry.count >= limit) {
    return false
  }

  entry.count++
  return true
}
