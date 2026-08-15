import { NextRequest, NextResponse } from 'next/server';
import { generateJoke, type GenerateJokeInput, type GenerateJokeOutput } from '@/ai/flows/generate-joke-flow';
import { GEMINI_MODELS } from '@/ai/models';
import { adminDb } from '@/lib/admin';
import { z } from 'zod';

/**
 * Number of top-rated jokes the server fetches by default to use as style
 * exemplars. Caller-supplied exemplars (e.g. the user's 5-star jokes) take
 * priority and fill the remaining slots up to this cap.
 */
const DEFAULT_EXEMPLAR_COUNT = 10;

/** Cap on the combined prefilledJokes list (client + server-side top jokes). */
const PREFILLED_JOKES_CAP = 25;

// Define the expected input schema for the API request body.
// `exemplarJokes` mirrors the flow's input (max 10, optional) so the
// caller can't smuggle in arbitrary-length arrays. `useServerExemplars`
// lets callers opt out of the default top-10 fetch (default: enabled).
const ApiInputSchema = z.object({
  topicHint: z.string().optional(),
  prefilledJokes: z.array(z.string()).optional(),
  exemplarJokes: z.array(z.string()).max(10).optional(),
  model: z.enum(GEMINI_MODELS).optional(),
  temperature: z.number().min(0).max(2).optional(),
  useServerExemplars: z.boolean().optional(),
});

/**
 * Fetch the top-rated existing jokes from Firestore to use as style
 * exemplars. Primary path: orderBy averageRating desc. Fallback path: order
 * by dateAdded desc (covers missing index or unrated-only corpora). Any
 * error is swallowed so generation never fails because of the exemplar
 * fetch.
 *
 * Caching: results are memoised at module scope for 60s keyed by the
 * requested limit. This cache is per-process (per serverless instance),
 * which is acceptable here: exemplars drift slowly, we already swallow
 * fetch errors, and a cold start simply refetches. Do NOT introduce
 * stale-while-revalidate logic without also invalidating on joke
 * create/update/delete.
 */
type ExemplarCacheEntry = { data: string[]; expiresAt: number };
const EXEMPLAR_CACHE_TTL_MS = 60_000;
// Module-scope cache. Survives across requests on the same serverless
// instance; rebuilt on cold start or after TTL expiry.
const exemplarCache: Map<number, ExemplarCacheEntry> = new Map();

async function fetchTopExemplars(limitCount: number): Promise<string[]> {
  const now = Date.now();
  const cached = exemplarCache.get(limitCount);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  try {
    let snap;
    try {
      snap = await adminDb
        .collection('jokes')
        .orderBy('averageRating', 'desc')
        .limit(limitCount)
        .get();
    } catch (primaryErr) {
      console.warn(
        '[generate-joke] averageRating-sorted exemplar query failed; falling back to dateAdded. Error:',
        primaryErr,
      );
      snap = await adminDb
        .collection('jokes')
        .orderBy('dateAdded', 'desc')
        .limit(limitCount)
        .get();
    }

    const texts: string[] = [];
    for (const docSnap of snap.docs) {
      const data = docSnap.data() as { text?: unknown; jokeText?: unknown };
      const candidate = typeof data.text === 'string' ? data.text : typeof data.jokeText === 'string' ? data.jokeText : null;
      if (candidate && candidate.trim().length > 0) {
        texts.push(candidate);
      }
    }
    exemplarCache.set(limitCount, { data: texts, expiresAt: now + EXEMPLAR_CACHE_TTL_MS });
    return texts;
  } catch (err) {
    // Last-ditch: never let exemplar fetch kill generation. Could be no
    // credentials in local dev, network error, missing index, etc.
    console.warn('[generate-joke] Failed to fetch server-side exemplars; continuing without them.', err);
    return [];
  }
}

/**
 * Merge two ordered string lists while preserving order and deduplicating
 * exact matches. Returns up to `cap` entries.
 */
function mergeOrderedUnique(primary: string[], secondary: string[], cap: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of [...primary, ...secondary]) {
    if (!item) continue;
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
    if (out.length >= cap) break;
  }
  return out;
}

export async function POST(request: NextRequest) {
  try {
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
    } = parsedInput.data;

    // Default ON: pull top-rated jokes from Firestore so generation is
    // informed by what the community already loves. Opt-out via
    // `useServerExemplars: false`.
    const shouldFetchServerExemplars = useServerExemplars !== false;
    const serverExemplars = shouldFetchServerExemplars
      ? await fetchTopExemplars(DEFAULT_EXEMPLAR_COUNT)
      : [];

    // Client exemplars take priority (these are often the user's own
    // 5-star picks); fill the rest from the server-fetched top jokes.
    const exemplarJokes = mergeOrderedUnique(
      clientExemplars ?? [],
      serverExemplars,
      DEFAULT_EXEMPLAR_COUNT,
    );

    // Combined prefilled list — dedup exact matches against both client
    // and server-fetched jokes so the critic's "originality" criterion
    // has the broadest possible context.
    const prefilledJokes = mergeOrderedUnique(
      clientPrefilled ?? [],
      serverExemplars,
      PREFILLED_JOKES_CAP,
    );

    // Prepare the input for the Genkit flow
    const aiInput: GenerateJokeInput = { topicHint, prefilledJokes, exemplarJokes, model, temperature };

    // Call the server-side Genkit flow
    const aiOutput: GenerateJokeOutput = await generateJoke(aiInput);

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
