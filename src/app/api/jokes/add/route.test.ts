// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), collection: vi.fn(), set: vi.fn() }));
vi.mock('@/lib/auth', () => ({ verifyApiToken: mocks.auth }));
vi.mock('@/lib/admin', () => ({ adminDb: { collection: mocks.collection } }));
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'now' } }));
import { POST } from './route';

const request = (body: string) => new NextRequest('http://localhost/api/jokes/add', { method: 'POST', body });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubEnv('JOKEHUB_JARVIS_USER_ID', 'jarvis');
  mocks.auth.mockResolvedValue({ success: true, userId: 'api-user', via: 'api-token' });
  mocks.collection.mockReturnValue({ doc: () => ({ id: 'new-id', set: mocks.set }) });
  mocks.set.mockResolvedValue(undefined);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('POST /api/jokes/add', () => {
  it('rejects a body that is not valid JSON with 400 and writes nothing', async () => {
    const res = await POST(request('{not json'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid input' });
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it('creates the joke from a valid body', async () => {
    const res = await POST(request(JSON.stringify({ text: 'A joke', category: 'Work' })));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 'new-id', text: 'A joke', category: 'Work' });
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ userId: 'jarvis', text: 'A joke', source: 'Jarvis AI' }));
  });
});
