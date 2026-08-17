import { NextRequest } from 'next/server';

/**
 * Minimal fixed-window rate limiter for the AI routes.
 *
 * SINGLE-INSTANCE CAVEAT: counters live in module scope, so the limit applies
 * per Node process (per serverless instance / per container). With N instances
 * a caller can effectively make N × `limit` requests per window, and every cold
 * start resets the counters. That is acceptable here — the goal is to stop
 * casual abuse of unmetered LLM billing, not to enforce a precise quota. Swap
 * the store for Redis/Firestore if a hard global limit is ever needed.
 */

interface Window {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  /** Max requests allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the current window resets — suitable for a `Retry-After` header. */
  retryAfterSeconds: number;
}

const windows = new Map<string, Window>();

/** Drop expired windows so the map can't grow without bound across many keys. */
function pruneExpired(now: number): void {
  for (const [key, window] of windows) {
    if (window.resetAt <= now) {
      windows.delete(key);
    }
  }
}

export function rateLimit(key: string, { limit, windowMs }: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  pruneExpired(now);

  const existing = windows.get(key);
  if (!existing) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: Math.ceil(windowMs / 1000) };
  }

  existing.count += 1;
  const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));

  if (existing.count > limit) {
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  return { allowed: true, remaining: limit - existing.count, retryAfterSeconds };
}

/**
 * Best-effort client IP. Behind a proxy the first `x-forwarded-for` hop is the
 * caller; a determined abuser can spoof it, which is why authenticated callers
 * are keyed by uid instead (see `rateLimitKeyFor`).
 */
export function clientIpFrom(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const firstHop = forwardedFor.split(',')[0]?.trim();
    if (firstHop) {
      return firstHop;
    }
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

/** Prefer the authenticated uid, fall back to the request IP. */
export function rateLimitKeyFor(request: NextRequest, scope: string, userId?: string): string {
  return userId ? `${scope}:user:${userId}` : `${scope}:ip:${clientIpFrom(request)}`;
}

/** Test/maintenance hook — clears all counters. */
export function resetRateLimits(): void {
  windows.clear();
}
