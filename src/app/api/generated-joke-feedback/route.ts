import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestAuth } from '@/lib/auth';
import { rateLimit, rateLimitKeyFor } from '@/lib/rateLimit';
import { FeedbackUpsertSchema, TASTE_LIMITS } from '@/lib/tasteProfile';
import { internalError, invalidInput, jsonResponse, readJson, requireUser } from '@/lib/userRouteGuard';
import { clearFeedback, summarizeFeedback, upsertFeedback } from '@/services/server/tasteStore';

/**
 * Feedback on generated jokes (thumbs up/down, reasons, saves), one record per
 * user and joke text in `generatedJokeFeedback` (see tasteStore). Votes on
 * jokes the user never saves record what was rejected, which feeds the avoid
 * examples and the per-user taste profile.
 *
 * POST keeps its original contract (API-token callers allowed) and also takes
 * `reason`, `saved` and a null/omitted vote. GET and DELETE manage the signed-in
 * user's own feedback and require a Firebase ID token.
 */
const RATE_LIMIT = { limit: 60, windowMs: 5 * 60_000 };
const MANAGE_SCOPE = 'taste-feedback';

export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyRequestAuth(request);
    if (!authResult.success || !authResult.userId) {
      return NextResponse.json({ error: authResult.error ?? 'Unauthorized' }, { status: authResult.status ?? 401 });
    }
    if (authResult.via !== 'api-token') {
      const { allowed, retryAfterSeconds } = rateLimit(rateLimitKeyFor(request, 'generated-joke-feedback', authResult.userId), RATE_LIMIT);
      if (!allowed) {
        return NextResponse.json({ error: 'Too many feedback requests. Please try again shortly.' }, { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } });
      }
    }
    const parsed = FeedbackUpsertSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', code: 'INVALID_INPUT' }, { status: 400 });
    }
    const feedback = await upsertFeedback(authResult.userId, parsed.data);
    return NextResponse.json({ ok: true, feedback });
  } catch (error) {
    console.error('[generated-joke-feedback] write failed', error instanceof Error ? error.name : 'unknown');
    return NextResponse.json({ error: 'Could not save feedback. Please try again.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

function parseLimit(value: string | null): number | null {
  if (value === null) return TASTE_LIMITS.feedbackPage;
  if (!/^\d{1,3}$/.test(value)) return null;
  const limit = Number(value);
  return limit >= 1 && limit <= TASTE_LIMITS.feedbackPage ? limit : null;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request, MANAGE_SCOPE);
    if ('response' in user) return user.response;
    const limit = parseLimit(request.nextUrl.searchParams.get('limit'));
    if (limit === null) return invalidInput();
    // Counts cover every record read (up to 500), not just the returned page.
    return jsonResponse(await summarizeFeedback(user.uid, limit));
  } catch (error) {
    return internalError(MANAGE_SCOPE, 'GET', error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireUser(request, MANAGE_SCOPE);
    if ('response' in user) return user.response;
    return jsonResponse({ deleted: await clearFeedback(user.uid) });
  } catch (error) {
    return internalError(MANAGE_SCOPE, 'DELETE', error);
  }
}
