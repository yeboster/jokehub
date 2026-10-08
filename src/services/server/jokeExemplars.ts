import { adminDb } from '@/lib/admin';
import { JOKE_GENERATION_LIMITS, normalizeJokeKey } from '@/lib/jokeGenerationContract';

type Exemplar = { id: string; text: string; category: string; average: number; count: number };
type Document = { id: string; data(): Record<string, unknown> };
const cache = new Map<number, { texts: string[]; expiresAt: number }>();
const TTL_MS = 60_000;

function validText(value: unknown): value is string {
  return typeof value === 'string' && value.length <= JOKE_GENERATION_LIMITS.contextTextChars && !!normalizeJokeKey(value);
}

function qualify(docs: Document[], pool: Exemplar[]): void {
  const ids = new Set(pool.map(item => item.id));
  const texts = new Set(pool.map(item => normalizeJokeKey(item.text)));
  for (const doc of docs) {
    const data = doc.data();
    const average = data.averageRating;
    const count = data.ratingCount;
    const text = validText(data.text) ? data.text : validText(data.jokeText) ? data.jokeText : null;
    if (typeof average !== 'number' || !Number.isFinite(average) || average < 4 || average > 5 ||
        typeof count !== 'number' || !Number.isInteger(count) || count < 3 || !text || ids.has(doc.id)) continue;
    const key = normalizeJokeKey(text);
    if (texts.has(key)) continue;
    ids.add(doc.id);
    texts.add(key);
    pool.push({ id: doc.id, text, average, count, category: typeof data.category === 'string' ? normalizeJokeKey(data.category) : '' });
  }
}

function compare(a: Exemplar, b: Exemplar): number {
  return b.average - a.average || b.count - a.count || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Bounded read-only aggregate qualification; never pads sparse pools with unrated jokes. */
export async function fetchJokeExemplars(limitCount: number = JOKE_GENERATION_LIMITS.exemplarJokes): Promise<string[]> {
  if (!Number.isInteger(limitCount) || limitCount < 1 || limitCount > JOKE_GENERATION_LIMITS.exemplarJokes) {
    throw new RangeError('Exemplar limit must be an integer from 1 to 10.');
  }
  const now = Date.now();
  const cached = cache.get(limitCount);
  if (cached && cached.expiresAt > now) return [...cached.texts];
  const pool: Exemplar[] = [];
  try {
    const snapshot = await adminDb.collection('jokes').orderBy('averageRating', 'desc').limit(50).get();
    qualify(snapshot.docs, pool);
  } catch { /* Missing index/network: try bounded recent pool below. */ }
  if (pool.length < JOKE_GENERATION_LIMITS.exemplarJokes || new Set(pool.map(item => item.category).filter(Boolean)).size < 2) {
    try {
      const snapshot = await adminDb.collection('jokes').orderBy('dateAdded', 'desc').limit(50).get();
      qualify(snapshot.docs, pool);
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
