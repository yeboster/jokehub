// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), rate: vi.fn(), key: vi.fn(), collection: vi.fn(), doc: vi.fn(), set: vi.fn() }));
vi.mock('@/lib/auth', () => ({ verifyRequestAuth: mocks.auth }));
vi.mock('@/lib/rateLimit', () => ({ rateLimit: mocks.rate, rateLimitKeyFor: mocks.key }));
vi.mock('@/lib/admin', () => ({ adminDb: { collection: mocks.collection }, FieldValue: { serverTimestamp: () => 'SERVER_TIME' } }));
import { POST } from './route';

const request = (body: unknown) => new NextRequest('http://localhost/api/generated-joke-feedback', { method: 'POST', body: JSON.stringify(body) });
const vote = { jokeText: 'They planet.', category: 'Space', vote: 'down', mode: 'classic', model: 'googleai/gemini-3.6-flash', topicHint: 'space', requestId: 'req-1' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.auth.mockResolvedValue({ success: true, via: 'id-token', userId: 'u1' });
  mocks.rate.mockReturnValue({ allowed: true });
  mocks.collection.mockReturnValue({ doc: mocks.doc });
  mocks.doc.mockReturnValue({ set: mocks.set });
  mocks.set.mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('generated joke feedback', () => {
  it('stores one vote per user and joke text, overwriting earlier votes', async () => {
    expect((await POST(request(vote))).status).toBe(200);
    expect((await POST(request({ ...vote, jokeText: ' THEY planet!! ', vote: 'up' }))).status).toBe(200);
    expect(mocks.collection).toHaveBeenCalledWith('generatedJokeFeedback');
    const [first, second] = mocks.doc.mock.calls.map(([id]) => id);
    expect(first).toMatch(/^u1_[0-9a-f]{32}$/);
    expect(second).toBe(first);
    expect(mocks.set).toHaveBeenNthCalledWith(1, { userId: 'u1', ...vote, updatedAt: 'SERVER_TIME' }, { merge: true });
  });
  it('accepts clearing a vote and optional context fields', async () => {
    expect((await POST(request({ jokeText: 'They planet.', category: 'Space', vote: 'none' }))).status).toBe(200);
    expect(mocks.set.mock.calls[0][0]).toEqual({ userId: 'u1', jokeText: 'They planet.', category: 'Space', vote: 'none', updatedAt: 'SERVER_TIME' });
  });
  it.each([
    { ...vote, vote: 'meh' }, { ...vote, jokeText: '!!!' }, { ...vote, jokeText: 'x'.repeat(2001) },
    { ...vote, category: 'x'.repeat(101) }, { ...vote, topicHint: 'x'.repeat(501) }, { ...vote, mode: 'remix' },
    { ...vote, requestId: 'x'.repeat(101) },
  ])('rejects invalid feedback %j without writing', async body => {
    expect((await POST(request(body))).status).toBe(400);
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it('requires authentication before rate limiting or writing', async () => {
    mocks.auth.mockResolvedValue({ success: false, status: 401, error: 'Unauthorized' });
    expect((await POST(request(vote))).status).toBe(401);
    expect(mocks.rate).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it('rate limits browser callers with Retry-After', async () => {
    mocks.rate.mockReturnValue({ allowed: false, retryAfterSeconds: 7 });
    const response = await POST(request(vote));
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('7');
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it('hides storage errors behind a generic message', async () => {
    mocks.set.mockRejectedValue(new Error('SECRET firestore detail'));
    const response = await POST(request(vote));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('SECRET');
  });
});
