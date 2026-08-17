
import { NextRequest, NextResponse } from 'next/server';
import { explainJoke } from '@/ai/flows/explain-joke-flow';
import { adminDb } from '@/lib/admin';
import { verifyRequestAuth } from '@/lib/auth';
import { rateLimit, rateLimitKeyFor } from '@/lib/rateLimit';
import { z } from 'zod';

/**
 * Rate limit for explanations — one Gemini call per request. Keyed by uid for
 * signed-in users, by IP otherwise; see the single-instance caveat in
 * `@/lib/rateLimit`.
 */
const RATE_LIMIT = { limit: 20, windowMs: 5 * 60_000 };

// Only the joke id is accepted: the text that gets explained (and persisted) is
// always read from Firestore, so a caller can't have the model explain — and
// then store — arbitrary text against someone else's joke.
//
// Deliberately no ownership gate: any signed-in user may request an explanation
// for any joke. Jokes are already readable by all, the explained text is read
// server-side rather than supplied by the caller, and the stored output is
// model-generated from that text — so a non-owner can't inject content into
// someone else's joke, only trigger a (rate-limited) explanation of it. This is
// the fix prescribed by audit §1.3; add an owner check only if explanations
// later become caller-influenced.
const ExplainJokeInputSchema = z.object({
  jokeId: z.string().min(1).describe('The id of the joke to be explained.'),
});

export async function POST(request: NextRequest) {
  try {
    // This route writes to `jokes/{jokeId}` through the Admin SDK, bypassing
    // security rules, so it must authenticate for itself.
    const authResult = await verifyRequestAuth(request);
    if (!authResult.success) {
      // 500 when we couldn't verify the credential at all (see `verifyRequestAuth`).
      return NextResponse.json({ error: authResult.error ?? 'Unauthorized' }, { status: authResult.status ?? 401 });
    }

    // Trusted server-to-server callers holding the shared token are exempt;
    // browser callers are throttled per user.
    if (authResult.via !== 'api-token') {
      const { allowed, retryAfterSeconds } = rateLimit(
        rateLimitKeyFor(request, 'explain-joke', authResult.userId),
        RATE_LIMIT,
      );
      if (!allowed) {
        return NextResponse.json(
          { error: 'Too many explanation requests. Please try again shortly.' },
          { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
        );
      }
    }

    const body = await request.json();
    const parsedInput = ExplainJokeInputSchema.safeParse(body);

    if (!parsedInput.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsedInput.error.format() }, { status: 400 });
    }

    const { jokeId } = parsedInput.data;

    // Existence check before anything is generated or written.
    const jokeRef = adminDb.collection('jokes').doc(jokeId);
    const jokeSnap = await jokeRef.get();
    if (!jokeSnap.exists) {
      return NextResponse.json({ error: 'Joke not found' }, { status: 404 });
    }

    const storedText = jokeSnap.get('text');
    if (typeof storedText !== 'string' || storedText.trim().length === 0) {
      return NextResponse.json({ error: 'Joke has no text to explain' }, { status: 422 });
    }

    const sourceStream = await explainJoke({ jokeText: storedText });
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let fullExplanation = '';

    // Preserve live streaming while retaining the complete response for persistence.
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const reader = sourceStream.getReader();
        let streamClosed = false;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }

            const chunk = decoder.decode(value, { stream: true });
            fullExplanation += chunk;
            controller.enqueue(encoder.encode(chunk));
          }

          const trailingChunk = decoder.decode();
          if (trailingChunk) {
            fullExplanation += trailingChunk;
            controller.enqueue(encoder.encode(trailingChunk));
          }

          if (fullExplanation.trim().length > 0) {
            try {
              // `update` (not `set`) so a joke deleted mid-stream is not
              // resurrected as a stub document.
              await jokeRef.update({ explanation: fullExplanation });
            } catch (error) {
              console.warn('Failed to persist AI joke explanation:', error);
            }
          }

          controller.close();
          streamClosed = true;
        } catch (error) {
          if (!streamClosed) {
            controller.error(error);
          }
        } finally {
          reader.releaseLock();
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
      },
    });

  } catch (error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TS 4.4 catch-unknown narrows poorly with Firebase/HTTP error unions here; any keeps the existing Error-extraction logic working unchanged.
    const err = error as any;
    console.error('API Error explaining joke:', err);
    let errorMessage = 'Failed to get joke explanation.';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    return NextResponse.json(
      { error: errorMessage },
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
