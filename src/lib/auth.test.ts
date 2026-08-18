// @vitest-environment node
// `next/server` needs the real Request/Response globals, which jsdom replaces.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const ORIGINAL_TOKEN = process.env.JOKEHUB_API_TOKEN;

const { verifyIdToken } = vi.hoisted(() => ({ verifyIdToken: vi.fn() }));

// The Admin SDK is initialised at import time in `@/lib/admin` and needs
// FIREBASE_* credentials; only the one method `auth.ts` calls is needed here.
vi.mock('@/lib/admin', () => ({ adminAuth: { verifyIdToken } }));

function makeRequest(headers?: Record<string, string>) {
  return new NextRequest('http://localhost/api/jokes/add', { headers });
}

/** Shapes an error the way the Admin SDK does, with a `code` property. */
function firebaseError(code: string, message = code): Error & { code: string } {
  return Object.assign(new Error(message), { code });
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

  // A server with no token configured cannot authenticate anyone; reporting
  // 401 would tell the caller their (perfectly good) token is bad.
  it('reports an unset JOKEHUB_API_TOKEN as a 500, not a 401', async () => {
    const { verifyApiToken } = await import('@/lib/auth');
    const result = await verifyApiToken(makeRequest({ Authorization: 'Bearer anything' }));
    expect(result).toEqual({ success: false, status: 500, error: 'Server configuration error' });
  });

  it('fails when the Authorization header is missing', async () => {
    process.env.JOKEHUB_API_TOKEN = 'secret-token';
    const { verifyApiToken } = await import('@/lib/auth');
    const result = await verifyApiToken(makeRequest());
    expect(result).toEqual({ success: false, status: 401, error: 'Missing Authorization header' });
  });

  it('fails when the token does not match but is the same length', async () => {
    process.env.JOKEHUB_API_TOKEN = 'secret-token';
    const { verifyApiToken } = await import('@/lib/auth');
    const result = await verifyApiToken(makeRequest({ Authorization: 'Bearer secret-tokeN' }));
    expect(result).toEqual({ success: false, status: 401, error: 'Invalid token' });
  });

  // `timingSafeEqual` throws on length mismatch, so the compare is length-guarded.
  it('fails without throwing when the token length differs', async () => {
    process.env.JOKEHUB_API_TOKEN = 'secret-token';
    const { verifyApiToken } = await import('@/lib/auth');
    const result = await verifyApiToken(makeRequest({ Authorization: 'Bearer wrong' }));
    expect(result).toEqual({ success: false, status: 401, error: 'Invalid token' });
  });

  it('fails when the header is not a bearer credential', async () => {
    process.env.JOKEHUB_API_TOKEN = 'secret-token';
    const { verifyApiToken } = await import('@/lib/auth');
    const result = await verifyApiToken(makeRequest({ Authorization: 'secret-token' }));
    expect(result).toEqual({ success: false, status: 401, error: 'Malformed Authorization header' });
  });

  it('fails when the bearer scheme has no token', async () => {
    process.env.JOKEHUB_API_TOKEN = 'secret-token';
    const { verifyApiToken } = await import('@/lib/auth');
    const result = await verifyApiToken(makeRequest({ Authorization: 'Bearer ' }));
    expect(result).toEqual({ success: false, status: 401, error: 'Malformed Authorization header' });
  });

  it('does not treat the scheme prefix as part of the token', async () => {
    // The old `replace('Bearer ', '')` parse accepted `Bearer Bearer <token>`.
    process.env.JOKEHUB_API_TOKEN = 'secret-token';
    const { verifyApiToken } = await import('@/lib/auth');
    const result = await verifyApiToken(makeRequest({ Authorization: 'Bearer Bearer secret-token' }));
    expect(result).toEqual({ success: false, status: 401, error: 'Malformed Authorization header' });
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

// Same module-level-constant caveat as above: each test sets its own token and
// re-imports. `verifyRequestAuth` accepts either the service token or a
// Firebase ID token, so the distinction that matters most here is a *bad
// credential* (401) versus a *server that cannot verify credentials* (500).
describe('verifyRequestAuth', () => {
  beforeEach(() => {
    delete process.env.JOKEHUB_API_TOKEN;
    vi.resetModules();
    verifyIdToken.mockReset();
    // The implementation logs on every verification failure; keep it quiet.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (ORIGINAL_TOKEN === undefined) {
      delete process.env.JOKEHUB_API_TOKEN;
    } else {
      process.env.JOKEHUB_API_TOKEN = ORIGINAL_TOKEN;
    }
  });

  it('fails when the Authorization header is missing, without calling Firebase', async () => {
    const { verifyRequestAuth } = await import('@/lib/auth');
    const result = await verifyRequestAuth(makeRequest());
    expect(result).toEqual({ success: false, error: 'Missing Authorization header' });
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it('fails when the header is not a bearer credential', async () => {
    const { verifyRequestAuth } = await import('@/lib/auth');
    const result = await verifyRequestAuth(makeRequest({ Authorization: 'Basic abc' }));
    expect(result).toEqual({ success: false, error: 'Malformed Authorization header' });
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it('accepts the service token without consulting Firebase', async () => {
    process.env.JOKEHUB_API_TOKEN = 'secret-token';
    const { verifyRequestAuth } = await import('@/lib/auth');
    const result = await verifyRequestAuth(makeRequest({ Authorization: 'Bearer secret-token' }));
    expect(result).toEqual({ success: true, userId: 'api-user', via: 'api-token' });
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it('accepts a valid Firebase ID token and returns its uid', async () => {
    process.env.JOKEHUB_API_TOKEN = 'secret-token';
    verifyIdToken.mockResolvedValue({ uid: 'uid-1' });
    const { verifyRequestAuth } = await import('@/lib/auth');
    const result = await verifyRequestAuth(makeRequest({ Authorization: 'Bearer id-token-value' }));
    expect(result).toEqual({ success: true, userId: 'uid-1', via: 'id-token' });
    expect(verifyIdToken).toHaveBeenCalledWith('id-token-value');
  });

  it('still verifies ID tokens when no service token is configured', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'uid-1' });
    const { verifyRequestAuth } = await import('@/lib/auth');
    const result = await verifyRequestAuth(makeRequest({ Authorization: 'Bearer id-token-value' }));
    expect(result).toEqual({ success: true, userId: 'uid-1', via: 'id-token' });
  });

  it.each([
    'auth/argument-error',
    'auth/id-token-expired',
    'auth/id-token-revoked',
    'auth/invalid-id-token',
    'auth/user-disabled',
    'auth/user-not-found',
  ])('reports %s as a 401 the caller can act on', async (code) => {
    verifyIdToken.mockRejectedValue(firebaseError(code));
    const { verifyRequestAuth } = await import('@/lib/auth');
    const result = await verifyRequestAuth(makeRequest({ Authorization: 'Bearer bad-token' }));
    expect(result).toEqual({ success: false, status: 401, error: 'Invalid or expired credentials' });
  });

  // A misconfigured or unreachable server must not tell the caller their
  // credential is bad — they would go re-authenticate against a broken server.
  it.each([
    ['an unrecognised Firebase error code', firebaseError('auth/internal-error')],
    ['a missing FIREBASE_* env var (plain Error)', new Error('Service account key is not configured')],
    ['a network failure without a code', Object.assign(new Error('ECONNREFUSED'), { errno: -111 })],
    ['a non-Error rejection', 'boom'],
  ])('reports %s as a 500', async (_label, thrown) => {
    verifyIdToken.mockRejectedValue(thrown);
    const { verifyRequestAuth } = await import('@/lib/auth');
    const result = await verifyRequestAuth(makeRequest({ Authorization: 'Bearer some-token' }));
    expect(result).toEqual({ success: false, status: 500, error: 'Server configuration error' });
  });

  it('falls through to ID-token verification when the token is not the service token', async () => {
    process.env.JOKEHUB_API_TOKEN = 'secret-token';
    verifyIdToken.mockResolvedValue({ uid: 'uid-2' });
    const { verifyRequestAuth } = await import('@/lib/auth');
    // Same length as the service token, so the constant-time compare runs fully.
    const result = await verifyRequestAuth(makeRequest({ Authorization: 'Bearer secret-tokeN' }));
    expect(result).toEqual({ success: true, userId: 'uid-2', via: 'id-token' });
    expect(verifyIdToken).toHaveBeenCalledWith('secret-tokeN');
  });
});
