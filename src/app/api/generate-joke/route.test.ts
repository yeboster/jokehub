// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.auth.mockResolvedValue({ success: true, via: 'firebase', userId: 'u' });
  mocks.rate.mockReturnValue({ allowed: true });
  mocks.collection.mockReturnValue({ orderBy: mocks.order });
  mocks.order.mockReturnValue({ limit: mocks.limit });
  mocks.limit.mockReturnValue({ get: mocks.get });
  mocks.get.mockResolvedValue({ docs: [] });
  mocks.generate.mockResolvedValue({ jokes: ['one', 'two', 'three'].map(jokeText => ({ jokeText, category: 'Work' })) });
  vi.stubEnv('JOKEHUB_ENABLE_JOKE_REPAIR', 'false');
});

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('generation progress transport', () => {
  it.each(['complete', 'cancel', 'abort'] as const)('sends five-second heartbeats and clears timer on %s', async ending => {
    vi.useFakeTimers();
    let finish!: (value: unknown) => void;
    mocks.generate.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const controller = new AbortController();
    const res = await POST(new NextRequest('http://localhost/api/generate-joke', {
      method: 'POST', headers: { Accept: 'application/x-ndjson' }, signal: controller.signal,
      body: JSON.stringify({ useServerExemplars: false }),
    }));
    const reader = res.body!.getReader();
    const decode = (value: Uint8Array | undefined) => new TextDecoder().decode(value);
    expect(decode((await reader.read()).value)).toContain('"type":"progress"');
    await vi.advanceTimersByTimeAsync(4999);
    let received = false;
    const next = reader.read().then(chunk => { received = true; return chunk; });
    await Promise.resolve();
    expect(received).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(JSON.parse(decode((await next).value))).toMatchObject({ type: 'heartbeat', elapsedMs: 5000 });
    if (ending === 'cancel') await reader.cancel();
    if (ending === 'abort') controller.abort();
    finish({ jokes: [] });
    if (ending !== 'cancel') { while (!(await reader.read()).done) { /* drain terminal */ } }
    expect(vi.getTimerCount()).toBe(0);
    reader.releaseLock();
  });
  it('streams real stage/result frames and correlates sanitized logs', async () => {
    let finish!: (value: unknown) => void;
    mocks.generate.mockImplementationOnce((_input, options) => {
      options.onProgress({ stage: 'generating', callCount: 1 });
      return new Promise(resolve => { finish = resolve; });
    });
    const req = new NextRequest('http://localhost/api/generate-joke', {
      method: 'POST', headers: { Accept: 'application/x-ndjson' },
      body: JSON.stringify({ useServerExemplars: false, topicHint: 'PRIVATE_TOPIC', prefilledJokes: ['PRIVATE_JOKE'] }),
    });
    const res = await POST(req);
    expect(res.headers.get('content-type')).toContain('application/x-ndjson');
    expect(res.headers.get('x-request-id')).toBeTruthy();
    const reader = res.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    expect(first).toContain('"stage":"examples"');
    finish({ jokes: ['one', 'two', 'three'].map(jokeText => ({ jokeText, category: 'Work' })) });
    let rest = ''; while (true) { const chunk = await reader.read(); if (chunk.done) break; rest += new TextDecoder().decode(chunk.value); }
    expect(first + rest).toContain('"stage":"generating"');
    expect(first + rest).toContain('"type":"result"');
    const logs = JSON.stringify(vi.mocked(console.info).mock.calls);
    expect(logs).toContain(res.headers.get('x-request-id'));
    expect(logs).toContain('callCount');
    expect(logs).not.toMatch(/PRIVATE_TOPIC|PRIVATE_JOKE/);
  });
  it('keeps request ID on early HTTP errors and never starts streaming or AI before auth', async () => {
    mocks.auth.mockResolvedValueOnce({ success: false, error: 'Unauthorized' });
    const res = await POST(new NextRequest('http://localhost/api/generate-joke', { method: 'POST', headers: { Accept: 'application/x-ndjson' }, body: '{}' }));
    expect(res.status).toBe(401);
    expect(res.headers.get('x-request-id')).toBeTruthy();
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it('stream cancellation revokes flow signal and progress logging also works for JSON callers', async () => {
    let finish!: (value: unknown) => void;
    let signal!: AbortSignal;
    mocks.generate.mockImplementationOnce((_input, options) => {
      signal = options.signal;
      return new Promise(resolve => { finish = resolve; });
    });
    const res = await POST(new NextRequest('http://localhost/api/generate-joke', { method: 'POST', headers: { Accept: 'application/x-ndjson' }, body: '{"useServerExemplars":false}' }));
    await res.body!.cancel();
    expect(signal.aborted).toBe(true);
    finish({ jokes: [] });
    mocks.generate.mockImplementationOnce(async (_input, options) => { options.onProgress({ stage: 'reviewing', callCount: 2 }); return { jokes: [] }; });
    expect((await POST(request({ useServerExemplars: false }))).headers.get('content-type')).toContain('application/json');
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).toContain('reviewing');
  });
  it.each(['toString', 'constructor', '__proto__'])('sanitizes unknown prototype-property errors %s for JSON and streams', async message => {
    for (const streaming of [false, true]) {
      mocks.generate.mockRejectedValueOnce(new Error(message));
      const res = await POST(new NextRequest('http://localhost/api/generate-joke', {
        method: 'POST', headers: streaming ? { Accept: 'application/x-ndjson' } : {},
        body: JSON.stringify({ useServerExemplars: false }),
      }));
      if (streaming) {
        const frames = (await res.text()).trim().split('\n').map(line => JSON.parse(line));
        expect(frames.at(-1)).toEqual({ type: 'error', requestId: res.headers.get('x-request-id'), error: 'Could not generate jokes. Please try again.', code: 'GENERATION_FAILED' });
      } else {
        expect(res.status).toBe(500);
        expect(await res.json()).toEqual({ error: 'Could not generate jokes. Please try again.' });
      }
    }
  });
  it('returns persistent safe stream errors, never raw upstream details', async () => {
    mocks.generate.mockRejectedValueOnce(new Error('SECRET provider prompt and token'));
    const res = await POST(new NextRequest('http://localhost/api/generate-joke', { method: 'POST', headers: { Accept: 'application/x-ndjson' }, body: JSON.stringify({ useServerExemplars: false }) }));
    const text = await res.text();
    expect(text).toContain('"type":"error"');
    expect(text).toContain('requestId');
    expect(text).not.toContain('SECRET');
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('SECRET');
  });
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
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ prefilledJokes: ['Hello!'], exemplarJokes: ['ＡBC!'], recentGeneratedJokes: ['last batch'], temperature: 0 }), expect.objectContaining({ allowRepair: false, onProgress: expect.any(Function), signal: expect.any(AbortSignal) }));
  });
  it.each([undefined, 'false', 'TRUE', '1', 'true'])('only literal trusted repair config enables option: %s', async value => {
    if (value === undefined) delete process.env.JOKEHUB_ENABLE_JOKE_REPAIR;
    else vi.stubEnv('JOKEHUB_ENABLE_JOKE_REPAIR', value);
    await POST(request({ useServerExemplars: false, allowRepair: true }));
    expect(mocks.generate.mock.calls[0][1]).toEqual(expect.objectContaining({ allowRepair: value === 'true', onProgress: expect.any(Function), signal: expect.any(AbortSignal) }));
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
