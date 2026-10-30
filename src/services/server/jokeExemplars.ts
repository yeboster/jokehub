import { adminDb } from '@/lib/admin';
import { JOKE_GENERATION_LIMITS, normalizeJokeKey } from '@/lib/jokeGenerationContract';

type Exemplar = { id: string; text: string; category: string; average: number; fromWebsite: boolean; draw: number };
type Document = { id: string; data(): Record<string, unknown> };
type Band = { min: number; max: number };
const cache = new Map<number, { texts: string[]; expiresAt: number }>();
const avoidCache: { texts: string[]; expiresAt: number } = { texts: [], expiresAt: 0 };
const TTL_MS = 60_000;
const POOL_SIZE = 200;
const AVOID_POOL_SIZE = 100;
const AVOID_LIMIT = 6;
const GOOD: Band = { min: 4, max: 5 };
const BAD: Band = { min: 1, max: 2 };

function validText(value: unknown): value is string {
  return typeof value === 'string' && value.length <= JOKE_GENERATION_LIMITS.contextTextChars && !!normalizeJokeKey(value);
}

/** Jokes copied from joke sites were picked by hand and rate highest; `source` is free text. */
function isWebsiteSource(source: unknown): boolean {
  return typeof source === 'string' && /^https?:\/\/|\.(com|org|net|edu)\b/i.test(source.trim());
}

// The app is effectively single-rater, so one rating is a real signal: requiring
// several left the pool permanently empty.
function qualify(docs: Document[], pool: Exemplar[], band: Band): void {
  const ids = new Set(pool.map(item => item.id));
  const texts = new Set(pool.map(item => normalizeJokeKey(item.text)));
  for (const doc of docs) {
    const data = doc.data();
    const average = data.averageRating;
    const count = data.ratingCount;
    const text = validText(data.text) ? data.text : validText(data.jokeText) ? data.jokeText : null;
    if (typeof average !== 'number' || !Number.isFinite(average) || average < band.min || average > band.max ||
        typeof count !== 'number' || !Number.isInteger(count) || count < 1 || !text || ids.has(doc.id)) continue;
    const key = normalizeJokeKey(text);
    if (texts.has(key)) continue;
    ids.add(doc.id);
    texts.add(key);
    pool.push({
      id: doc.id, text, average, fromWebsite: isWebsiteSource(data.source), draw: Math.random(),
      category: typeof data.category === 'string' ? normalizeJokeKey(data.category) : '',
    });
  }
}

/** Random draw varies the sample between cache windows; ID keeps ties deterministic. */
function compare(a: Exemplar, b: Exemplar): number {
  return Number(b.fromWebsite) - Number(a.fromWebsite) || b.average - a.average || a.draw - b.draw ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Bounded read-only aggregate qualification; never pads sparse pools with unrated jokes. */
export async function fetchJokeExemplars(limitCount: number = JOKE_GENERATION_LIMITS.exemplarJokes): Promise<string[]> {
  if (!Number.isInteger(limitCount) || limitCount < 1 || limitCount > JOKE_GENERATION_LIMITS.exemplarJokes) {
    throw new RangeError(`Exemplar limit must be an integer from 1 to ${JOKE_GENERATION_LIMITS.exemplarJokes}.`);
  }
  const now = Date.now();
  const cached = cache.get(limitCount);
  if (cached && cached.expiresAt > now) return [...cached.texts];
  const pool: Exemplar[] = [];
  try {
    const snapshot = await adminDb.collection('jokes').orderBy('averageRating', 'desc').limit(POOL_SIZE).get();
    qualify(snapshot.docs, pool, GOOD);
  } catch { /* Missing index/network: try bounded recent pool below. */ }
  if (pool.length < JOKE_GENERATION_LIMITS.exemplarJokes || new Set(pool.map(item => item.category).filter(Boolean)).size < 2) {
    try {
      const snapshot = await adminDb.collection('jokes').orderBy('dateAdded', 'desc').limit(POOL_SIZE).get();
      qualify(snapshot.docs, pool, GOOD);
    } catch { /* Preserve qualified primary pool when fallback fails. */ }
  }
  const buckets = new Map<string, Exemplar[]>();
  for (const item of pool) {
    const bucket = buckets.get(item.category) ?? [];
    bucket.push(item);
    buckets.set(item.category, bucket);
  }
  const ordered = [...buckets.entries()];
  for (const [, bucket] of ordered) bucket.sort(compare);
  ordered.sort(([aKey, a], [bKey, b]) => compare(a[0], b[0]) || (aKey < bKey ? -1 : aKey > bKey ? 1 : 0));
  const texts: string[] = [];
  for (let round = 0; texts.length < limitCount; round++) {
    let added = false;
    for (const [, bucket] of ordered) {
      if (bucket[round]) { texts.push(bucket[round].text); added = true; }
      if (texts.length === limitCount) break;
    }
    if (!added) break;
  }
  cache.set(limitCount, { texts, expiresAt: now + TTL_MS });
  return [...texts];
}

/** Jokes rated 1–2 stars, lowest first, as concrete examples of what to avoid. */
export async function fetchAvoidExamples(): Promise<string[]> {
  const now = Date.now();
  if (avoidCache.expiresAt > now) return [...avoidCache.texts];
  const pool: Exemplar[] = [];
  try {
    const snapshot = await adminDb.collection('jokes').orderBy('averageRating', 'asc').limit(AVOID_POOL_SIZE).get();
    qualify(snapshot.docs, pool, BAD);
  } catch { /* Avoid examples are optional context. */ }
  const texts = pool
    .sort((a, b) => a.average - b.average || a.draw - b.draw || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, AVOID_LIMIT)
    .map(item => item.text);
  Object.assign(avoidCache, { texts, expiresAt: now + TTL_MS });
  return [...texts];
}
