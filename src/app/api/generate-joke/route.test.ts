// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  generate: vi.fn(), auth: vi.fn(), rate: vi.fn(), key: vi.fn(), get: vi.fn(), order: vi.fn(), limit: vi.fn(), collection: vi.fn(),
}));
vi.mock('@/ai/flows/generate-joke-flow', () => ({ generateJoke: mocks.generate }));
vi.mock('@/lib/auth', () => ({ verifyRequestAuth: mocks.auth }));
vi.mock('@/lib/rateLimit', () => ({ rateLimit: mocks.rate, rateLimitKeyFor: mocks.key }));
vi.mock('@/lib/admin', () => ({ adminDb: { collection: mocks.collection } }));
import { POST } from './route';
const request = (body: unknown) => new NextRequest('http://localhost/api/generate-joke', { method: 'POST', body: JSON.stringify(body) });
const doc = (id: string, data: Record<string, unknown>) => ({ id, data: () => data });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ success: true, via: 'firebase', userId: 'u' });
  mocks.rate.mockReturnValue({ allowed: true });
  mocks.collection.mockReturnValue({ orderBy: mocks.order });
  mocks.order.mockReturnValue({ limit: mocks.limit });
  mocks.limit.mockReturnValue({ get: mocks.get });
  mocks.get.mockResolvedValue({ docs: [] });
  mocks.generate.mockResolvedValue({ jokes: ['one', 'two', 'three'].map(jokeText => ({ jokeText, category: 'Work' })) });
  vi.stubEnv('JOKEHUB_ENABLE_JOKE_REPAIR', 'false');
});

describe('generation route context', () => {
  it('rejects unrated server examples and bounds read pools', async () => {
    mocks.get.mockResolvedValue({ docs: [doc('bad', { text: 'unrated' }), doc('good', { text: 'Rated reference', averageRating: 4.5, ratingCount: 3, category: 'Work' })] });
    expect((await POST(request({}))).status).toBe(200);
    expect(mocks.generate.mock.calls[0][0].exemplarJokes).toEqual(['Rated reference']);
    expect(mocks.limit).toHaveBeenCalledWith(50);
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });
  it.each([
    { topicHint: 'a'.repeat(501) }, { prefilledJokes: Array(26).fill('valid') },
    { recentGeneratedJokes: Array(13).fill('valid') }, { exemplarJokes: ['a'.repeat(2001)] },
    { recentGeneratedJokes: ['!!!'] }, { temperature: 3 },
    { topicHint: 7 }, { prefilledJokes: ['!!!'] }, { prefilledJokes: ['x'.repeat(2001)] },
    { exemplarJokes: Array(11).fill('valid') }, { recentGeneratedJokes: ['x'.repeat(2001)] },
    { recentGeneratedJokes: [null] }, { useServerExemplars: 'false' }, { model: 'unknown' },
  ])('rejects oversized/invalid client context %j before reads or AI', async body => {
    expect((await POST(request(body))).status).toBe(400);
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it('accepts exact caps and bounded text while preserving caller intent', async () => {
    const body = { topicHint: 't'.repeat(500), prefilledJokes: Array.from({ length: 25 }, (_, i) => `${i}${'x'.repeat(1998)}`), exemplarJokes: Array.from({ length: 10 }, (_, i) => `exemplar ${i}`), recentGeneratedJokes: Array.from({ length: 12 }, (_, i) => `recent ${i}`), useServerExemplars: false };
    expect((await POST(request(body))).status).toBe(200);
    expect(mocks.generate.mock.calls[0][0]).toEqual(expect.objectContaining({ topicHint: body.topicHint, prefilledJokes: body.prefilledJokes, exemplarJokes: body.exemplarJokes, recentGeneratedJokes: body.recentGeneratedJokes }));
  });
  it('preserves separate history, client-first normalized references and zero temperature', async () => {
    expect((await POST(request({ useServerExemplars: false, prefilledJokes: ['Hello!', 'hello'], exemplarJokes: ['ＡBC!', 'abc'], recentGeneratedJokes: ['last batch'], temperature: 0 }))).status).toBe(200);
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ prefilledJokes: ['Hello!'], exemplarJokes: ['ＡBC!'], recentGeneratedJokes: ['last batch'], temperature: 0 }), { allowRepair: false });
  });
  it.each([undefined, 'false', 'TRUE', '1', 'true'])('only literal trusted repair config enables option: %s', async value => {
    if (value === undefined) delete process.env.JOKEHUB_ENABLE_JOKE_REPAIR;
    else vi.stubEnv('JOKEHUB_ENABLE_JOKE_REPAIR', value);
    await POST(request({ useServerExemplars: false, allowRepair: true }));
    expect(mocks.generate.mock.calls[0][1]).toEqual({ allowRepair: value === 'true' });
    expect(mocks.generate.mock.calls[0][0]).not.toHaveProperty('allowRepair');
  });
  it('auth denial precedes reads, rate limit and AI', async () => {
    mocks.auth.mockResolvedValue({ success: false, status: 401, error: 'Unauthorized' });
    const response = await POST(request({}));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(mocks.rate).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it('preserves rate limit and Retry-After; API token exempt', async () => {
    mocks.rate.mockReturnValue({ allowed: false, retryAfterSeconds: 42 });
    const response = await POST(request({}));
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('42');
    expect(mocks.rate).toHaveBeenCalledWith(undefined, { limit: 10, windowMs: 300000 });
    mocks.auth.mockResolvedValue({ success: true, via: 'api-token' });
    vi.clearAllMocks();
    expect((await POST(request({ useServerExemplars: false }))).status).toBe(200);
    expect(mocks.rate).not.toHaveBeenCalled();
  });
});
