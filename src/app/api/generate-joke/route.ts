import { NextRequest, NextResponse } from 'next/server';
import { generateJoke, type GenerateJokeInput, type GenerateJokeOutput } from '@/ai/flows/generate-joke-flow';
import { GEMINI_MODELS } from '@/ai/models';
import { fetchJokeExemplars } from '@/services/server/jokeExemplars';
import { JOKE_GENERATION_LIMITS, mergeUniqueJokeTexts, normalizeJokeKey } from '@/lib/jokeGenerationContract';
import { verifyRequestAuth } from '@/lib/auth';
import { rateLimit, rateLimitKeyFor } from '@/lib/rateLimit';
import { z } from 'zod';

/**
 * Rate limit for joke generation. Default requests cost two application AI calls (6
 * candidates + critic); trusted opt-in repair costs at most four, so the window is deliberately tight. Keyed by uid for
 * signed-in users, by IP otherwise; see the single-instance caveat in
 * `@/lib/rateLimit`.
 */
const RATE_LIMIT = { limit: 10, windowMs: 5 * 60_000 };

const ContextTextSchema = z.string().max(JOKE_GENERATION_LIMITS.contextTextChars)
  .refine(text => !!normalizeJokeKey(text), 'Context text must not be empty.');
const ApiInputSchema = z.object({
  topicHint: z.string().max(JOKE_GENERATION_LIMITS.topicHintChars).optional(),
  prefilledJokes: z.array(ContextTextSchema).max(JOKE_GENERATION_LIMITS.prefilledJokes).optional(),
  exemplarJokes: z.array(ContextTextSchema).max(JOKE_GENERATION_LIMITS.exemplarJokes).optional(),
  recentGeneratedJokes: z.array(ContextTextSchema).max(JOKE_GENERATION_LIMITS.recentGeneratedJokes).optional(),
  model: z.enum(GEMINI_MODELS).optional(),
  temperature: z.number().finite().min(0).max(2).optional(),
  useServerExemplars: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    // A Firebase ID token or the shared service token is required — this route
    // spends real money on every call.
    const authResult = await verifyRequestAuth(request);
    if (!authResult.success) {
      // 500 when we couldn't verify the credential at all (see `verifyRequestAuth`).
      return NextResponse.json({ error: authResult.error ?? 'Unauthorized' }, { status: authResult.status ?? 401 });
    }

    // Trusted server-to-server callers holding the shared token are exempt;
    // browser callers are throttled per user.
    if (authResult.via !== 'api-token') {
      const { allowed, retryAfterSeconds } = rateLimit(
        rateLimitKeyFor(request, 'generate-joke', authResult.userId),
        RATE_LIMIT,
      );
      if (!allowed) {
        return NextResponse.json(
          { error: 'Too many generation requests. Please try again shortly.' },
          { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
        );
      }
    }

    const body = await request.json();
    const parsedInput = ApiInputSchema.safeParse(body);

    if (!parsedInput.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsedInput.error.format() }, { status: 400 });
    }

    const {
      topicHint,
      prefilledJokes: clientPrefilled,
      exemplarJokes: clientExemplars,
      model,
      temperature,
      useServerExemplars,
      recentGeneratedJokes,
    } = parsedInput.data;

    // Default ON: pull top-rated jokes from Firestore so generation is
    // informed by what the community already loves. Opt-out via
    // `useServerExemplars: false`.
    const shouldFetchServerExemplars = useServerExemplars !== false;
    const serverExemplars = shouldFetchServerExemplars
      ? await fetchJokeExemplars()
      : [];

    // Client exemplars take priority (these are often the user's own
    // 5-star picks); fill the rest from the server-fetched top jokes.
    const exemplarJokes = mergeUniqueJokeTexts(
      clientExemplars ?? [],
      serverExemplars,
      JOKE_GENERATION_LIMITS.exemplarJokes,
    );

    // Combined prefilled list — dedup normalized matches against both client
    // and server-fetched jokes so the critic's "originality" criterion
    // has the broadest possible context.
    const prefilledJokes = mergeUniqueJokeTexts(
      clientPrefilled ?? [],
      serverExemplars,
      JOKE_GENERATION_LIMITS.prefilledJokes,
    );

    // Prepare the input for the Genkit flow
    const aiInput: GenerateJokeInput = { topicHint, prefilledJokes, exemplarJokes, recentGeneratedJokes, model, temperature };

    // Call the server-side Genkit flow
    const aiOutput: GenerateJokeOutput = await generateJoke(aiInput, { allowRepair: process.env.JOKEHUB_ENABLE_JOKE_REPAIR === 'true' });

    // Return the successful response
    return NextResponse.json(aiOutput, { status: 200 });

  } catch (error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AI/model errors include both Error and Genkit-specific shapes; preserved log-key access via any.
    const err = error as any;
    console.error('API Error generating joke:', err);

    let errorMessage = 'Failed to generate joke.';
    // If the error is an instance of Error, use its message
    if (error instanceof Error) {
        errorMessage = error.message;
    }
    // You could add more specific error handling here if needed,
    // for example, checking error.code for specific AI model errors.

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
