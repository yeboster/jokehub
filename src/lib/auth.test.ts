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

  it('fails when the token does not match but is the same length', async () => {
    process.env.JOKEHUB_API_TOKEN = 'secret-token';
    const { verifyApiToken } = await import('@/lib/auth');
    const result = await verifyApiToken(makeRequest({ Authorization: 'Bearer secret-tokeN' }));
    expect(result).toEqual({ success: false, error: 'Invalid token' });
  });

  // `timingSafeEqual` throws on length mismatch, so the compare is length-guarded.
  it('fails without throwing when the token length differs', async () => {
    process.env.JOKEHUB_API_TOKEN = 'secret-token';
    const { verifyApiToken } = await import('@/lib/auth');
    const result = await verifyApiToken(makeRequest({ Authorization: 'Bearer wrong' }));
    expect(result).toEqual({ success: false, error: 'Invalid token' });
  });

  it('fails when the header is not a bearer credential', async () => {
    process.env.JOKEHUB_API_TOKEN = 'secret-token';
    const { verifyApiToken } = await import('@/lib/auth');
    const result = await verifyApiToken(makeRequest({ Authorization: 'secret-token' }));
    expect(result).toEqual({ success: false, error: 'Malformed Authorization header' });
  });

  it('fails when the bearer scheme has no token', async () => {
    process.env.JOKEHUB_API_TOKEN = 'secret-token';
    const { verifyApiToken } = await import('@/lib/auth');
    const result = await verifyApiToken(makeRequest({ Authorization: 'Bearer ' }));
    expect(result).toEqual({ success: false, error: 'Malformed Authorization header' });
  });

  it('does not treat the scheme prefix as part of the token', async () => {
    // The old `replace('Bearer ', '')` parse accepted `Bearer Bearer <token>`.
    process.env.JOKEHUB_API_TOKEN = 'secret-token';
    const { verifyApiToken } = await import('@/lib/auth');
    const result = await verifyApiToken(makeRequest({ Authorization: 'Bearer Bearer secret-token' }));
    expect(result).toEqual({ success: false, error: 'Malformed Authorization header' });
  });

  it('succeeds when the bearer token matches', async () => {
    process.env.JOKEHUB_API_TOKEN = 'secret-token';
    const { verifyApiToken } = await import('@/lib/auth');
    const result = await verifyApiToken(makeRequest({ Authorization: 'Bearer secret-token' }));
    expect(result).toEqual({ success: true, userId: 'api-user', via: 'api-token' });
  });

  it('accepts a case-insensitive scheme and extra whitespace', async () => {
    process.env.JOKEHUB_API_TOKEN = 'secret-token';
    const { verifyApiToken } = await import('@/lib/auth');
    const result = await verifyApiToken(makeRequest({ Authorization: 'bearer   secret-token  ' }));
    expect(result).toEqual({ success: true, userId: 'api-user', via: 'api-token' });
  });
});
