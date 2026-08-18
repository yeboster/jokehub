import { NextRequest, NextResponse } from 'next/server';
import { fetchTopJokes } from '@/services/server/topJokes';
import { verifyApiToken } from '@/lib/auth';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const DEFAULT_MIN_RATING = 4;

/** Parses a query param, falling back to `fallback` when absent or non-numeric, then clamps it. */
function clampParam(raw: string | null, fallback: number, min: number, max: number, parse: (value: string) => number) {
  const parsed = raw === null ? Number.NaN : parse(raw);
  return Math.min(Math.max(Number.isFinite(parsed) ? parsed : fallback, min), max);
}

// GET /api/jokes/top?limit=10&minRating=4
export async function GET(request: NextRequest) {
  try {
    // Verify API token
    const authResult = await verifyApiToken(request);
    if (!authResult.success) {
      // 500 when the server itself is unconfigured (see `verifyApiToken`).
      return NextResponse.json({ error: authResult.error ?? 'Unauthorized' }, { status: authResult.status ?? 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    // Clamped so `?limit=abc` can't reach Firestore's `limit()` as NaN (a 500)
    // and `?limit=100000` can't be honored in full.
    const limit = clampParam(searchParams.get('limit'), DEFAULT_LIMIT, 1, MAX_LIMIT, (value) =>
      Number.parseInt(value, 10)
    );
    // parseFloat, not parseInt: average ratings are fractional (e.g. 4.5).
    const minRating = clampParam(searchParams.get('minRating'), DEFAULT_MIN_RATING, 0, 5, Number.parseFloat);

    const jokes = await fetchTopJokes({ limit, minRating });
    
    return NextResponse.json({ 
      jokes, 
      query: { limit, minRating },
      count: jokes.length 
    }, { status: 200 });
  } catch (error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Firestore Admin SDK errors expose `.message` and arbitrary metadata; unknown narrows too much for the index-error branch below.
    const err = error as any;
    console.error('Error fetching top jokes:', err);
    // Check if it's a Firestore index error
    if (err.message?.includes('requires an index')) {
      return NextResponse.json({
        error: 'Firestore index required. Please create composite index on jokes.averageRating.',
        details: err.message
      }, { status: 500 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
