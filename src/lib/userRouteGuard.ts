/**
 * Shared request handling for the per-user taste routes (`/api/joke-samples`
 * and GET/DELETE `/api/generated-joke-feedback`). Server-only.
 *
 * Only signed-in users (Firebase ID token) are accepted: the shared API token
 * has no user to store data for. Errors never echo request content, and logs
 * carry no user ids or user text.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestAuth } from '@/lib/auth';
import { rateLimit, rateLimitKeyFor } from '@/lib/rateLimit';

const RATE_LIMIT = { limit: 60, windowMs: 60_000 };
const NO_STORE = { 'Cache-Control': 'no-store' };

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): NextResponse {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

export function errorResponse(status: number, error: string, code: string, headers: Record<string, string> = {}): NextResponse {
  return jsonResponse({ error, code }, status, headers);
}

export const invalidInput = () => errorResponse(400, 'Invalid input', 'INVALID_INPUT');

/** Resolves the signed-in user's uid, or the response to return instead. */
export async function requireUser(request: NextRequest, scope: string): Promise<{ uid: string } | { response: NextResponse }> {
  const auth = await verifyRequestAuth(request);
  if (!auth.success) {
    return { response: errorResponse(auth.status ?? 401, auth.error ?? 'Unauthorized', 'AUTH_REQUIRED') };
  }
  if (auth.via !== 'id-token' || !auth.userId) {
    return { response: errorResponse(403, 'Sign in as a user to use this feature.', 'USER_REQUIRED') };
  }
  const { allowed, retryAfterSeconds } = rateLimit(rateLimitKeyFor(request, scope, auth.userId), RATE_LIMIT);
  if (!allowed) {
    return {
      response: errorResponse(429, 'Too many requests. Please try again shortly.', 'RATE_LIMITED', { 'Retry-After': String(retryAfterSeconds) }),
    };
  }
  return { uid: auth.userId };
}

/** Parsed JSON body, or `undefined` when the body is not valid JSON. */
export async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

/** Generic 500; logs only the route, method and error class name. */
export function internalError(scope: string, method: string, error: unknown): NextResponse {
  const errorName = error instanceof Error ? error.name : typeof error;
  console.error('[taste-api]', { scope, method, code: 'INTERNAL_ERROR', errorName });
  return errorResponse(500, 'Something went wrong. Please try again.', 'INTERNAL_ERROR');
}
