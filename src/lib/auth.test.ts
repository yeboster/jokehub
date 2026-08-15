import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const ORIGINAL_TOKEN = process.env.JOKEHUB_API_TOKEN;

function makeRequest(headers?: Record<string, string>) {
  return new NextRequest('http://localhost/api/jokes/add', { headers });
}

// `auth.ts` reads JOKEHUB_API_TOKEN into a module-level constant at import
// time, so each test resets modules and re-imports after setting its own env value.
describe('verifyApiToken', () => {
  beforeEach(() => {
    delete process.env.JOKEHUB_API_TOKEN;
    vi.resetModules();
  });

  afterEach(() => {
    if (ORIGINAL_TOKEN === undefined) {
      delete process.env.JOKEHUB_API_TOKEN;
    } else {
      process.env.JOKEHUB_API_TOKEN = ORIGINAL_TOKEN;
    }
  });

  it('fails with a server configuration error when JOKEHUB_API_TOKEN is unset', async () => {
    const { verifyApiToken } = await import('@/lib/auth');
    const result = await verifyApiToken(makeRequest({ Authorization: 'Bearer anything' }));
    expect(result).toEqual({ success: false, error: 'Server configuration error' });
  });

  it('fails when the Authorization header is missing', async () => {
    process.env.JOKEHUB_API_TOKEN = 'secret-token';
    const { verifyApiToken } = await import('@/lib/auth');
    const result = await verifyApiToken(makeRequest());
    expect(result).toEqual({ success: false, error: 'Missing Authorization header' });
  });

  it('fails when the token does not match', async () => {
    process.env.JOKEHUB_API_TOKEN = 'secret-token';
    const { verifyApiToken } = await import('@/lib/auth');
    const result = await verifyApiToken(makeRequest({ Authorization: 'Bearer wrong-token' }));
    expect(result).toEqual({ success: false, error: 'Invalid token' });
  });

  it('succeeds when the bearer token matches', async () => {
    process.env.JOKEHUB_API_TOKEN = 'secret-token';
    const { verifyApiToken } = await import('@/lib/auth');
    const result = await verifyApiToken(makeRequest({ Authorization: 'Bearer secret-token' }));
    expect(result).toEqual({ success: true, userId: 'api-user' });
  });
});
