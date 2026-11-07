// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), rate: vi.fn(), key: vi.fn(),
  list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ verifyRequestAuth: mocks.auth }));
vi.mock('@/lib/rateLimit', () => ({ rateLimit: mocks.rate, rateLimitKeyFor: mocks.key }));
vi.mock('@/services/server/tasteStore', () => {
  class SampleLimitError extends Error {
    readonly code = 'SAMPLE_LIMIT';
    constructor() { super('You can keep up to 50 samples. Delete one to add another.'); }
  }
  return { SampleLimitError, listSamples: mocks.list, createSample: mocks.create, updateSample: mocks.update, deleteSample: mocks.remove };
});
import { SampleLimitError } from '@/services/server/tasteStore';
import { DELETE, GET, PATCH, POST } from './route';

const URL = 'http://localhost/api/joke-samples';
const ID = 'b'.repeat(32);
const req = (method: string, init: { body?: string; query?: string } = {}) =>
  new NextRequest(`${URL}${init.query ?? ''}`, { method, body: init.body, headers: { Authorization: 'Bearer t' } });
const sample = (overrides: Record<string, unknown> = {}) => ({
  id: ID, text: 'Sample', active: true, createdAt: '2026-11-07T00:00:00.000Z', updatedAt: '2026-11-07T00:00:00.000Z', ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.auth.mockResolvedValue({ success: true, via: 'id-token', userId: 'uid-123' });
  mocks.rate.mockReturnValue({ allowed: true, remaining: 59, retryAfterSeconds: 60 });
  mocks.key.mockImplementation((_req, scope, uid) => `${scope}:user:${uid}`);
});

describe('auth and rate limiting', () => {
  it.each([
    ['GET', () => GET(req('GET'))],
    ['POST', () => POST(req('POST', { body: JSON.stringify({ text: 'Sample' }) }))],
    ['PATCH', () => PATCH(req('PATCH', { body: JSON.stringify({ id: ID, active: false }) }))],
    ['DELETE', () => DELETE(req('DELETE', { query: `?id=${ID}` }))],
  ])('%s respects the auth status, rejects API-token callers and rate limits per user', async (_method, call) => {
    mocks.auth.mockResolvedValueOnce({ success: false, status: 401, error: 'Invalid or expired credentials' });
    let res = await call();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Invalid or expired credentials', code: 'AUTH_REQUIRED' });

    mocks.auth.mockResolvedValueOnce({ success: true, via: 'api-token', userId: 'api-user' });
    res = await call();
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'USER_REQUIRED' });

    mocks.rate.mockReturnValueOnce({ allowed: false, remaining: 0, retryAfterSeconds: 5 });
    res = await call();
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('5');
    expect(mocks.rate).toHaveBeenLastCalledWith('joke-samples:user:uid-123', { limit: 60, windowMs: 60_000 });
    for (const fn of [mocks.list, mocks.create, mocks.update, mocks.remove]) expect(fn).not.toHaveBeenCalled();
  });
});

describe('GET', () => {
  it('lists samples', async () => {
    mocks.list.mockResolvedValue([sample()]);
    const res = await GET(req('GET'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({ samples: [sample()] });
    expect(mocks.list).toHaveBeenCalledWith('uid-123');
  });
});

describe('POST', () => {
  it('returns 201 when created and 200 when the sample already existed', async () => {
    mocks.create.mockResolvedValueOnce({ sample: sample(), created: true });
    let res = await POST(req('POST', { body: JSON.stringify({ text: 'Sample', note: 'why' }) }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ sample: sample(), created: true });
    expect(mocks.create).toHaveBeenCalledWith('uid-123', { text: 'Sample', note: 'why' });

    mocks.create.mockResolvedValueOnce({ sample: sample(), created: false });
    res = await POST(req('POST', { body: JSON.stringify({ text: 'Sample' }) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sample: sample(), created: false });
  });

  it('returns 409 SAMPLE_LIMIT at the cap', async () => {
    mocks.create.mockRejectedValue(new SampleLimitError());
    const res = await POST(req('POST', { body: JSON.stringify({ text: 'Sample' }) }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'You can keep up to 50 samples. Delete one to add another.', code: 'SAMPLE_LIMIT' });
  });

  it.each([
    ['malformed JSON', '{'],
    ['blank text', JSON.stringify({ text: '  ?! ' })],
    ['too long', JSON.stringify({ text: 'x'.repeat(2001) })],
    ['long note', JSON.stringify({ text: 'Sample', note: 'n'.repeat(201) })],
  ])('rejects %s with 400', async (_name, body) => {
    const res = await POST(req('POST', { body }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid input', code: 'INVALID_INPUT' });
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

describe('PATCH', () => {
  it('returns the updated sample, or 404 when missing', async () => {
    mocks.update.mockResolvedValueOnce(sample({ active: false }));
    let res = await PATCH(req('PATCH', { body: JSON.stringify({ id: ID, active: false, note: null }) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sample: sample({ active: false }) });
    expect(mocks.update).toHaveBeenCalledWith('uid-123', { id: ID, active: false, note: null });

    mocks.update.mockResolvedValueOnce(null);
    res = await PATCH(req('PATCH', { body: JSON.stringify({ id: ID, active: true }) }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Sample not found', code: 'NOT_FOUND' });
  });

  it.each([
    ['bad id', JSON.stringify({ id: 'XYZ', active: true })],
    ['bad active', JSON.stringify({ id: ID, active: 'yes' })],
    ['malformed JSON', 'nope'],
  ])('rejects %s with 400', async (_name, body) => {
    expect((await PATCH(req('PATCH', { body }))).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe('DELETE', () => {
  it('deletes by validated id', async () => {
    mocks.remove.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    let res = await DELETE(req('DELETE', { query: `?id=${ID}` }));
    expect(await res.json()).toEqual({ deleted: true });
    expect(mocks.remove).toHaveBeenCalledWith('uid-123', ID);
    res = await DELETE(req('DELETE', { query: `?id=${ID}` }));
    expect(await res.json()).toEqual({ deleted: false });
  });

  it.each(['', '?id=', '?id=../x', `?id=${'A'.repeat(32)}`])('rejects query %j with 400', async query => {
    const res = await DELETE(req('DELETE', { query }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid input', code: 'INVALID_INPUT' });
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});

describe('unexpected errors', () => {
  it('returns a generic 500 and logs no sample text, note or user id', async () => {
    mocks.create.mockRejectedValue(new Error('users/uid-123 PRIVATE SAMPLE'));
    const res = await POST(req('POST', { body: JSON.stringify({ text: 'PRIVATE SAMPLE', note: 'PRIVATE NOTE' }) }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Something went wrong. Please try again.', code: 'INTERNAL_ERROR' });
    const logged = vi.mocked(console.error).mock.calls.flat()
      .map(arg => (arg instanceof Error ? `${arg.message} ${arg.stack}` : JSON.stringify(arg))).join(' ');
    expect(logged).not.toMatch(/PRIVATE|uid-123/);
  });
});
