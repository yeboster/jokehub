/**
 * Joke Studio batches: the generated jokes a user is reviewing on /add-joke.
 * Kept in `sessionStorage` per uid so a reload or a trip to a saved joke does
 * not lose them. Storage is best-effort: every access is guarded and the page
 * works without it.
 */
import { z } from 'zod';
import { JOKE_GENERATION_LIMITS, JOKE_MODES, mergeUniqueJokeTexts, type JokeMode } from '@/lib/jokeGenerationContract';
import { FeedbackVoteSchema, type FeedbackVote } from '@/lib/tasteProfile';

export const STUDIO_BATCH_LIMIT = 5;

const StudioJokeSchema = z.object({
  id: z.string().min(1),
  jokeText: z.string().min(1),
  category: z.string().min(1),
  status: z.enum(['idle', 'saving', 'saved']),
  savedJokeId: z.string().optional(),
  vote: FeedbackVoteSchema.nullable(),
  reason: z.string().optional(),
});
const StudioBatchSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string(),
  topicHint: z.string(),
  mode: z.enum(JOKE_MODES),
  model: z.string(),
  requestId: z.string().nullable(),
  requestedCount: z.number().int(),
  jokes: z.array(StudioJokeSchema),
});

export type StudioJokeStatus = 'idle' | 'saving' | 'saved';
export type StudioJoke = {
  id: string; jokeText: string; category: string; status: StudioJokeStatus;
  savedJokeId?: string; vote: FeedbackVote | null; reason?: string;
};
export type StudioBatch = {
  id: string; createdAt: string; topicHint: string; mode: JokeMode; model: string;
  /** Server request id, sent with feedback so votes can be traced to a run. */
  requestId: string | null;
  requestedCount: number; jokes: StudioJoke[];
};
export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function studioBatchesKey(uid: string) { return `jokehub:studio-batches:${uid}`; }

/** `window.sessionStorage` itself throws when site data is blocked. */
export function sessionStorageOrNull(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.sessionStorage; } catch { return null; }
}

export function readStoredBatches(storage: StorageLike | null, uid: string): StudioBatch[] {
  try {
    const raw = storage?.getItem(studioBatchesKey(uid));
    if (!raw) return [];
    const parsed = z.array(StudioBatchSchema).safeParse(JSON.parse(raw));
    if (!parsed.success) return [];
    // A save that was in flight when the page went away has an unknown
    // outcome; offering Save again is safer than a card stuck on "Saving".
    return parsed.data.slice(0, STUDIO_BATCH_LIMIT).map(batch => ({
      ...batch,
      jokes: batch.jokes.map(joke => joke.status === 'saving' ? { ...joke, status: 'idle' as const } : joke),
    }));
  } catch {
    return [];
  }
}

export function writeStoredBatches(storage: StorageLike | null, uid: string, batches: StudioBatch[]) {
  try { storage?.setItem(studioBatchesKey(uid), JSON.stringify(batches)); } catch { /* best-effort */ }
}

/** Sign-out: drop every account's batches kept in this tab. */
export function clearAllStoredBatches(storage: Pick<Storage, 'key' | 'length' | 'removeItem'> | null) {
  try {
    if (!storage) return;
    const prefix = studioBatchesKey('');
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (key?.startsWith(prefix)) keys.push(key);
    }
    keys.forEach(key => storage.removeItem(key));
  } catch { /* best-effort */ }
}

export function prependBatch(batches: StudioBatch[], batch: StudioBatch): StudioBatch[] {
  return [batch, ...batches].slice(0, STUDIO_BATCH_LIMIT);
}

/** Generated texts from the session's batches, newest first, for `recentGeneratedJokes`. */
export function recentGeneratedHistory(batches: StudioBatch[]): string[] {
  return mergeUniqueJokeTexts(
    batches.flatMap(batch => batch.jokes.map(joke => joke.jokeText)),
    [],
    JOKE_GENERATION_LIMITS.recentGeneratedJokes,
  );
}

let idCounter = 0;
export function studioId(prefix: string) {
  idCounter = (idCounter + 1) % Number.MAX_SAFE_INTEGER;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
