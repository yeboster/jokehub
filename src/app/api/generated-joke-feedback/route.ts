import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, FieldValue } from '@/lib/admin';
import { verifyRequestAuth } from '@/lib/auth';
import { JOKE_GENERATION_LIMITS, JOKE_MODES, normalizeJokeKey } from '@/lib/jokeGenerationContract';
import { rateLimit, rateLimitKeyFor } from '@/lib/rateLimit';
import { GENERATED_JOKE_FEEDBACK_COLLECTION } from '@/services/server/jokeExemplars';
import { z } from 'zod';

/**
 * Thumbs up/down on generated jokes the user may never save. Saved jokes only
 * show what was kept; these votes record what was rejected, which feeds the
 * avoid examples and is the groundwork for any later tuning.
 *
 * Written through the Admin SDK: `generatedJokeFeedback` has no client rules,
 * so browsers cannot read or write it directly.
 */
const RATE_LIMIT = { limit: 60, windowMs: 5 * 60_000 };

const FeedbackSchema = z.object({
  jokeText: z.string().max(JOKE_GENERATION_LIMITS.contextTextChars).refine(text => !!normalizeJokeKey(text)),
  category: z.string().max(100),
  vote: z.enum(['up', 'down', 'none']),
  mode: z.enum(JOKE_MODES).optional(),
  model: z.string().max(100).optional(),
  topicHint: z.string().max(JOKE_GENERATION_LIMITS.topicHintChars).optional(),
  requestId: z.string().max(100).optional(),
});

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
    let body: unknown;
    try { body = await request.json(); } catch {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    const parsed = FeedbackSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.format() }, { status: 400 });
    }
    // One document per user and joke text, so changing a vote overwrites it.
    const textHash = createHash('sha256').update(normalizeJokeKey(parsed.data.jokeText)).digest('hex').slice(0, 32);
    await adminDb.collection(GENERATED_JOKE_FEEDBACK_COLLECTION).doc(`${authResult.userId}_${textHash}`)
      .set({ userId: authResult.userId, ...parsed.data, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[generated-joke-feedback] write failed', error instanceof Error ? error.name : 'unknown');
    return NextResponse.json({ error: 'Could not save feedback. Please try again.' }, { status: 500 });
  }
}
