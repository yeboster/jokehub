// @vitest-environment node
// `next/server` needs the real Request/Response globals, which jsdom replaces.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { clientIpFrom, rateLimit, rateLimitKeyFor, resetRateLimits } from '@/lib/rateLimit';

const OPTIONS = { limit: 3, windowMs: 60_000 };

function makeRequest(headers?: Record<string, string>) {
  return new NextRequest('http://localhost/api/explain-joke', { headers });
}

describe('rateLimit', () => {
  beforeEach(() => {
    resetRateLimits();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-17T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    resetRateLimits();
  });

  it('allows the first request and counts it against the window', () => {
    expect(rateLimit('k', OPTIONS)).toEqual({ allowed: true, remaining: 2, retryAfterSeconds: 60 });
  });

  it('decrements the remaining count on each request in the window', () => {
    expect(rateLimit('k', OPTIONS).remaining).toBe(2);
    expect(rateLimit('k', OPTIONS).remaining).toBe(1);
    expect(rateLimit('k', OPTIONS).remaining).toBe(0);
  });

  it('allows exactly `limit` requests, then blocks', () => {
    for (let i = 0; i < OPTIONS.limit; i++) {
      expect(rateLimit('k', OPTIONS).allowed).toBe(true);
    }
    expect(rateLimit('k', OPTIONS)).toEqual({ allowed: false, remaining: 0, retryAfterSeconds: 60 });
  });

  it('keeps blocking for the rest of the window without extending it', () => {
    for (let i = 0; i < OPTIONS.limit + 1; i++) rateLimit('k', OPTIONS);
    vi.advanceTimersByTime(30_000);
    const result = rateLimit('k', OPTIONS);
    expect(result.allowed).toBe(false);
    // 30s into a 60s window — the window's end did not move when it was hit.
    expect(result.retryAfterSeconds).toBe(30);
  });

  it('reports retryAfterSeconds as at least 1 at the very end of a window', () => {
    rateLimit('k', OPTIONS);
    vi.advanceTimersByTime(OPTIONS.windowMs - 1);
    expect(rateLimit('k', OPTIONS).retryAfterSeconds).toBe(1);
  });

  it('starts a fresh window once the old one has expired', () => {
    for (let i = 0; i < OPTIONS.limit + 1; i++) rateLimit('k', OPTIONS);
    vi.advanceTimersByTime(OPTIONS.windowMs);
    expect(rateLimit('k', OPTIONS)).toEqual({ allowed: true, remaining: 2, retryAfterSeconds: 60 });
  });

  it('counts each key independently', () => {
    for (let i = 0; i < OPTIONS.limit + 1; i++) rateLimit('a', OPTIONS);
    expect(rateLimit('a', OPTIONS).allowed).toBe(false);
    expect(rateLimit('b', OPTIONS).allowed).toBe(true);
  });

  it('prunes expired windows so the store cannot grow without bound', () => {
    rateLimit('old', OPTIONS);
    vi.advanceTimersByTime(OPTIONS.windowMs);
    // Any call prunes first; 'old' is gone, so it behaves like a new key.
    rateLimit('other', OPTIONS);
    expect(rateLimit('old', OPTIONS)).toEqual({ allowed: true, remaining: 2, retryAfterSeconds: 60 });
  });

  // Documents the accepted fixed-window trade-off called out in rateLimit.ts:
  // over a window-length span the effective ceiling is 2 × limit.
  it('permits a boundary burst of 2 × limit across two adjacent windows', () => {
    const allowedCalls = () => {
      let allowed = 0;
      for (let i = 0; i < OPTIONS.limit; i++) if (rateLimit('k', OPTIONS).allowed) allowed++;
      return allowed;
    };
    expect(allowedCalls()).toBe(OPTIONS.limit); // end of window 1
    vi.advanceTimersByTime(OPTIONS.windowMs);
    expect(allowedCalls()).toBe(OPTIONS.limit); // start of window 2
  });

  it('resetRateLimits clears every counter', () => {
    for (let i = 0; i < OPTIONS.limit + 1; i++) rateLimit('k', OPTIONS);
    resetRateLimits();
    expect(rateLimit('k', OPTIONS).allowed).toBe(true);
  });
});

describe('clientIpFrom', () => {
  it('takes the first hop of x-forwarded-for', () => {
    expect(clientIpFrom(makeRequest({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe('1.2.3.4');
  });

  it('trims whitespace around the first hop', () => {
    expect(clientIpFrom(makeRequest({ 'x-forwarded-for': '  1.2.3.4 , 5.6.7.8' }))).toBe('1.2.3.4');
  });

  it('falls back to x-real-ip when x-forwarded-for is absent', () => {
    expect(clientIpFrom(makeRequest({ 'x-real-ip': '9.9.9.9' }))).toBe('9.9.9.9');
  });

  it('falls back to x-real-ip when x-forwarded-for is empty or blank', () => {
    expect(clientIpFrom(makeRequest({ 'x-forwarded-for': '', 'x-real-ip': '9.9.9.9' }))).toBe('9.9.9.9');
    expect(clientIpFrom(makeRequest({ 'x-forwarded-for': '   ', 'x-real-ip': '9.9.9.9' }))).toBe('9.9.9.9');
  });

  it('returns "unknown" when neither header is present', () => {
    expect(clientIpFrom(makeRequest())).toBe('unknown');
  });
});

describe('rateLimitKeyFor', () => {
  it('keys authenticated callers by uid, ignoring spoofable headers', () => {
    expect(rateLimitKeyFor(makeRequest({ 'x-forwarded-for': '1.2.3.4' }), 'explain', 'uid-1')).toBe(
      'explain:user:uid-1'
    );
  });

  it('keys anonymous callers by IP', () => {
    expect(rateLimitKeyFor(makeRequest({ 'x-forwarded-for': '1.2.3.4' }), 'explain')).toBe('explain:ip:1.2.3.4');
  });

  it('namespaces by scope so two routes do not share a budget', () => {
    const request = makeRequest({ 'x-forwarded-for': '1.2.3.4' });
    expect(rateLimitKeyFor(request, 'explain')).not.toBe(rateLimitKeyFor(request, 'generate'));
  });
});
