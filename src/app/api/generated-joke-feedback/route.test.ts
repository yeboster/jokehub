// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), rate: vi.fn(), key: vi.fn(), upsert: vi.fn(), list: vi.fn(), clear: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ verifyRequestAuth: mocks.auth }));
vi.mock('@/lib/rateLimit', () => ({ rateLimit: mocks.rate, rateLimitKeyFor: mocks.key }));
vi.mock('@/services/server/tasteStore', () => ({ upsertFeedback: mocks.upsert, listFeedback: mocks.list, clearFeedback: mocks.clear }));
import { DELETE, GET, POST } from './route';

const URL = 'http://localhost/api/generated-joke-feedback';
const request = (body: unknown) => new NextRequest(URL, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });
const req = (method: string, query = '') => new NextRequest(`${URL}${query}`, { method });
const vote = { jokeText: 'They planet.', category: 'Space', vote: 'down', mode: 'classic', model: 'googleai/gemini-3.6-flash', topicHint: 'space', requestId: 'req-1' };
const record = (overrides: Record<string, unknown> = {}) => ({
  id: 'a'.repeat(32), jokeText: 'They planet.', vote: 'down', saved: false, updatedAt: '2026-11-07T00:00:00.000Z', ...overrides,
});
const logged = () => vi.mocked(console.error).mock.calls.flat()
  .map(arg => (arg instanceof Error ? `${arg.message} ${arg.stack}` : JSON.stringify(arg))).join(' ');

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.auth.mockResolvedValue({ success: true, via: 'id-token', userId: 'u1' });
  mocks.rate.mockReturnValue({ allowed: true });
  mocks.key.mockImplementation((_req, scope, uid) => `${scope}:user:${uid}`);
  mocks.upsert.mockResolvedValue(record());
});
afterEach(() => vi.restoreAllMocks());

describe('POST (existing thumbs contract, extended)', () => {
  it('stores the vote for the signed-in user and returns the record', async () => {
    const response = await POST(request(vote));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, feedback: record() });
    expect(mocks.upsert).toHaveBeenCalledWith('u1', vote);
  });

  it('accepts clearing a vote with the legacy "none" (normalized to null) and optional context fields', async () => {
    mocks.upsert.mockResolvedValue(null);
    const response = await POST(request({ jokeText: 'They planet.', category: 'Space', vote: 'none' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, feedback: null });
    expect(mocks.upsert).toHaveBeenCalledWith('u1', { jokeText: 'They planet.', category: 'Space', vote: null });
  });

  it('accepts reason, saved, vote null and an omitted vote/category', async () => {
    await POST(request({ jokeText: 'They planet.', vote: 'down', reason: 'too obvious' }));
    expect(mocks.upsert).toHaveBeenLastCalledWith('u1', { jokeText: 'They planet.', vote: 'down', reason: 'too obvious' });
    await POST(request({ jokeText: 'They planet.', saved: true }));
    expect(mocks.upsert).toHaveBeenLastCalledWith('u1', { jokeText: 'They planet.', saved: true });
    await POST(request({ jokeText: 'They planet.', vote: null, reason: null }));
    expect(mocks.upsert).toHaveBeenLastCalledWith('u1', { jokeText: 'They planet.', vote: null, reason: null });
  });

  it.each([
    { ...vote, vote: 'meh' }, { ...vote, jokeText: '!!!' }, { ...vote, jokeText: 'x'.repeat(2001) },
    { ...vote, category: 'x'.repeat(101) }, { ...vote, topicHint: 'x'.repeat(501) }, { ...vote, mode: 'remix' },
    { ...vote, requestId: 'x'.repeat(101) }, { ...vote, reason: 'x'.repeat(201) }, { ...vote, saved: 'yes' },
  ])('rejects invalid feedback %j without writing', async body => {
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'Invalid input', code: 'INVALID_INPUT' });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON without writing', async () => {
    expect((await POST(request('{nope'))).status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('requires authentication before rate limiting or writing', async () => {
    mocks.auth.mockResolvedValue({ success: false, status: 401, error: 'Unauthorized' });
    expect((await POST(request(vote))).status).toBe(401);
    mocks.auth.mockResolvedValue({ success: false, status: 500, error: 'Server configuration error' });
    expect((await POST(request(vote))).status).toBe(500);
    expect(mocks.rate).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('still allows API-token callers, without the browser rate limit', async () => {
    mocks.auth.mockResolvedValue({ success: true, via: 'api-token', userId: 'api-user' });
    expect((await POST(request(vote))).status).toBe(200);
    expect(mocks.rate).not.toHaveBeenCalled();
    expect(mocks.upsert).toHaveBeenCalledWith('api-user', vote);
  });

  it('rate limits browser callers (60 per 5 minutes) with Retry-After', async () => {
    mocks.rate.mockReturnValue({ allowed: false, retryAfterSeconds: 7 });
    const response = await POST(request(vote));
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('7');
    expect(mocks.rate).toHaveBeenCalledWith('generated-joke-feedback:user:u1', { limit: 60, windowMs: 5 * 60_000 });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('hides storage errors behind a generic message and logs no joke text or user id', async () => {
    mocks.upsert.mockRejectedValue(new Error('SECRET firestore detail for u1: They planet.'));
    const response = await POST(request({ ...vote, reason: 'PRIVATE REASON' }));
    expect(response.status).toBe(500);
    const body = JSON.stringify(await response.json());
    expect(body).not.toContain('SECRET');
    expect(body).not.toContain('They planet');
    expect(logged()).not.toMatch(/SECRET|They planet|PRIVATE|u1/);
  });
});

describe('GET and DELETE (signed-in users only)', () => {
  it.each([
    ['GET', () => GET(req('GET'))],
    ['DELETE', () => DELETE(req('DELETE'))],
  ])('%s respects the auth status, rejects API-token callers and rate limits per user', async (_method, call) => {
    mocks.auth.mockResolvedValueOnce({ success: false, error: 'Missing Authorization header' });
    let response = await call();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Missing Authorization header', code: 'AUTH_REQUIRED' });

    mocks.auth.mockResolvedValueOnce({ success: true, via: 'api-token', userId: 'api-user' });
    response = await call();
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'USER_REQUIRED' });
    expect(mocks.rate).not.toHaveBeenCalled();

    mocks.rate.mockReturnValueOnce({ allowed: false, retryAfterSeconds: 9 });
    response = await call();
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('9');
    expect(mocks.rate).toHaveBeenLastCalledWith('taste-feedback:user:u1', { limit: 60, windowMs: 60_000 });
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.clear).not.toHaveBeenCalled();
  });

  it('GET returns the page and liked/disliked counts with the default limit', async () => {
    mocks.list.mockResolvedValue([
      record({ vote: 'up' }), record({ vote: null, saved: true }), record({ vote: 'down', saved: true }), record({ vote: 'down' }),
    ]);
    const response = await GET(req('GET'));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const body = await response.json();
    expect(body.counts).toEqual({ liked: 2, disliked: 2 });
    expect(body.feedback).toHaveLength(4);
    expect(mocks.list).toHaveBeenCalledWith('u1', 100);
  });

  it.each(['1', '100', '42'])('GET accepts limit=%s', async limit => {
    mocks.list.mockResolvedValue([]);
    expect((await GET(req('GET', `?limit=${limit}`))).status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith('u1', Number(limit));
  });

  it.each(['0', '101', '1.5', 'abc', '', '-1'])('GET rejects limit=%s', async limit => {
    const response = await GET(req('GET', `?limit=${limit}`));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid input', code: 'INVALID_INPUT' });
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it('DELETE clears all feedback and returns the count', async () => {
    mocks.clear.mockResolvedValue(7);
    const response = await DELETE(req('DELETE'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: 7 });
    expect(mocks.clear).toHaveBeenCalledWith('u1');
  });

  it('GET/DELETE storage errors return a generic 500 and log no user id', async () => {
    mocks.list.mockRejectedValue(new Error('read failed for u1'));
    mocks.clear.mockRejectedValue(new Error('delete failed for u1'));
    for (const response of [await GET(req('GET')), await DELETE(req('DELETE'))]) {
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'Something went wrong. Please try again.', code: 'INTERNAL_ERROR' });
    }
    expect(logged()).not.toMatch(/u1/);
  });
});
