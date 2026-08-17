import { timingSafeEqual } from 'node:crypto';
import { NextRequest } from 'next/server';

import { adminAuth } from '@/lib/admin';

const API_TOKEN = process.env.JOKEHUB_API_TOKEN;

/** `Bearer <token>` — case-insensitive scheme, any run of whitespace, token may contain spaces-free payloads only. */
const BEARER_PATTERN = /^Bearer\s+(\S+)$/i;

export interface AuthResult {
  success: boolean;
  userId?: string;
  error?: string;
  /**
   * HTTP status the caller should respond with when `success` is false.
   * Absent means 401 — only set explicitly when the failure is the server's
   * fault rather than the caller's.
   */
  status?: number;
  /** Which credential authenticated the request (only set on success). */
  via?: 'api-token' | 'id-token';
}

/**
 * Firebase error codes that mean "this credential is bad" as opposed to "this
 * server cannot verify credentials right now". Anything outside the set —
 * missing `FIREBASE_*` env vars, a failed public-key fetch, a network blip —
 * is an infrastructure failure and must not be reported to the caller as a
 * 401, which would send them off re-authenticating against a broken server.
 */
const CREDENTIAL_ERROR_CODES = new Set([
  'auth/argument-error',
  'auth/id-token-expired',
  'auth/id-token-revoked',
  'auth/invalid-id-token',
  'auth/user-disabled',
  'auth/user-not-found',
]);

/** True only for errors we can positively attribute to the caller's token. */
function isCredentialError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  return typeof code === 'string' && CREDENTIAL_ERROR_CODES.has(code);
}

/** Pulls the bearer payload out of the Authorization header, or null if absent/malformed. */
function extractBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    return null;
  }
  const match = BEARER_PATTERN.exec(authHeader.trim());
  return match ? match[1] : null;
}

/**
 * Constant-time token comparison. `timingSafeEqual` throws when the buffers
 * differ in length, so length is checked first — that check itself leaks only
 * the token length, which is not secret.
 */
function tokensMatch(candidate: string, expected: string): boolean {
  const candidateBytes = Buffer.from(candidate, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  if (candidateBytes.length !== expectedBytes.length) {
    return false;
  }
  return timingSafeEqual(candidateBytes, expectedBytes);
}

/**
 * Verifies the shared service token (`JOKEHUB_API_TOKEN`). Used by the
 * machine-to-machine routes (`/api/jokes/add`, `/api/jokes/top`).
 */
export async function verifyApiToken(request: NextRequest): Promise<AuthResult> {
  if (!API_TOKEN) {
    console.error('JOKEHUB_API_TOKEN is not configured');
    return { success: false, error: 'Server configuration error' };
  }

  if (!request.headers.get('Authorization')) {
    return { success: false, error: 'Missing Authorization header' };
  }

  const token = extractBearerToken(request);
  if (!token) {
    return { success: false, error: 'Malformed Authorization header' };
  }

  if (!tokensMatch(token, API_TOKEN)) {
    return { success: false, error: 'Invalid token' };
  }

  return { success: true, userId: 'api-user', via: 'api-token' };
}

/**
 * Accepts either credential: the shared service token, or a Firebase ID token
 * belonging to a signed-in user. Used by the AI routes, which are reachable
 * from the browser (ID token) and from the Jarvis integration (service token).
 */
export async function verifyRequestAuth(request: NextRequest): Promise<AuthResult> {
  if (!request.headers.get('Authorization')) {
    return { success: false, error: 'Missing Authorization header' };
  }

  const token = extractBearerToken(request);
  if (!token) {
    return { success: false, error: 'Malformed Authorization header' };
  }

  if (API_TOKEN && tokensMatch(token, API_TOKEN)) {
    return { success: true, userId: 'api-user', via: 'api-token' };
  }

  try {
    // Note: touching `adminAuth` initialises the Admin SDK, so a missing
    // FIREBASE_* env var surfaces here as a throw too — not as a bad token.
    const decoded = await adminAuth.verifyIdToken(token);
    return { success: true, userId: decoded.uid, via: 'id-token' };
  } catch (error) {
    const detail = error instanceof Error ? error.message : error;
    if (!isCredentialError(error)) {
      console.error('Firebase ID token verification unavailable:', detail);
      return { success: false, status: 500, error: 'Server configuration error' };
    }
    console.warn('Firebase ID token verification failed:', detail);
    return { success: false, status: 401, error: 'Invalid or expired credentials' };
  }
}
