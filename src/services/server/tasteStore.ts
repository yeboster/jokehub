/**
 * Per-user generation feedback and joke samples (Admin SDK only).
 *
 * Feedback lives in the existing top-level `generatedJokeFeedback`
 * collection (also read by the avoid-examples downvote reader), one document
 * per user and joke text: `${uid}_${tasteDocId(text)}`. Samples live at
 * `users/{uid}/jokeSamples/{tasteDocId(text)}`. Neither path has client rules;
 * the Admin SDK bypasses them. Per-user feedback reads use an equality-only
 * filter and sort in memory, and samples use a single-field `orderBy`, so no
 * composite index is needed.
 */
import { createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/admin';
import { JOKE_GENERATION_LIMITS, JokeTextSchema, normalizeJokeKey } from '@/lib/jokeGenerationContract';
import {
  FeedbackUpsertSchema, GenerationFeedbackSchema, JokeSampleSchema, SampleCreateSchema, SampleUpdateSchema,
  TASTE_LIMITS, TasteDocIdSchema, emptyTasteProfile,
  type FeedbackUpsertInput, type GenerationFeedback, type JokeSample,
  type SampleCreate, type SampleUpdate, type TasteExample, type TasteProfile,
} from '@/lib/tasteProfile';
import { GENERATED_JOKE_FEEDBACK_COLLECTION } from '@/services/server/jokeExemplars';

export class SampleLimitError extends Error {
  readonly code = 'SAMPLE_LIMIT';
  constructor() { super('You can keep up to 50 samples. Delete one to add another.'); }
}

type StoredData = Record<string, unknown>;

const DELETE_BATCH_SIZE = 400;
/** Upper bound on one user's feedback documents read per listing. */
const FEEDBACK_READ_CAP = 500;

/** Deterministic document id: first 32 hex chars of sha256(normalizeJokeKey(text)). */
export function tasteDocId(text: string): string {
  return createHash('sha256').update(normalizeJokeKey(text)).digest('hex').slice(0, 32);
}

function checkedUid(uid: string): string {
  if (typeof uid !== 'string' || !uid || uid.includes('/')) throw new Error('Invalid user id');
  return uid;
}
const samplesCollection = (uid: string) => adminDb.collection('users').doc(checkedUid(uid)).collection('jokeSamples');
const feedbackRef = (uid: string, id: string) => adminDb.collection(GENERATED_JOKE_FEEDBACK_COLLECTION).doc(`${checkedUid(uid)}_${id}`);
const userFeedbackQuery = (uid: string) => adminDb.collection(GENERATED_JOKE_FEEDBACK_COLLECTION).where('userId', '==', checkedUid(uid));

function asTimestamp(value: unknown): Timestamp | null {
  return value instanceof Timestamp ? value : null;
}

/** Tolerates missing or non-Timestamp fields (epoch) instead of failing a whole list. */
function toIso(value: unknown): string {
  return (asTimestamp(value)?.toDate() ?? new Date(0)).toISOString();
}

function optionalText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/** Drops undefined values: Firestore rejects them. */
function compact<T extends StoredData>(data: T): T {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) as T;
}

/**
 * Legacy documents written before saves and reasons existed may carry
 * `vote: 'none'` and no `saved`: they read as no vote and not saved.
 */
function readFeedback(id: string, data: StoredData | undefined): GenerationFeedback | null {
  if (!data) return null;
  const parsed = GenerationFeedbackSchema.safeParse(compact({
    id,
    jokeText: data.jokeText,
    category: optionalText(data.category),
    vote: data.vote === undefined || data.vote === 'none' ? null : data.vote,
    reason: optionalText(data.reason),
    saved: data.saved === undefined ? false : data.saved,
    topicHint: optionalText(data.topicHint),
    model: optionalText(data.model),
    updatedAt: toIso(data.updatedAt),
  }));
  return parsed.success ? parsed.data : null;
}

const isEmptyFeedback = (feedback: GenerationFeedback) => feedback.vote === null && !feedback.saved;

function readSample(id: string, data: StoredData | undefined): JokeSample | null {
  if (!data) return null;
  const parsed = JokeSampleSchema.safeParse(compact({
    id,
    text: data.text,
    note: optionalText(data.note),
    active: data.active === undefined ? true : data.active,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  }));
  return parsed.success ? parsed.data : null;
}

function sampleDocument(sample: Pick<JokeSample, 'text' | 'note' | 'active'>, createdAt: Timestamp, updatedAt: Timestamp): StoredData {
  return compact({ text: sample.text, note: sample.note, active: sample.active, createdAt, updatedAt });
}

/**
 * Merges with "undefined = unchanged, null (or legacy 'none') = clear" for
 * `vote`/`reason` and "undefined = unchanged" for `saved` and the descriptive
 * fields. A reason only lives alongside a vote; a cleared vote is stored as
 * null, never `'none'`. Returns the stored record, or null when the merge left
 * nothing to keep (the document is deleted).
 */
export async function upsertFeedback(uid: string, input: FeedbackUpsertInput): Promise<GenerationFeedback | null> {
  const change = FeedbackUpsertSchema.parse(input);
  const id = tasteDocId(change.jokeText);
  const ref = feedbackRef(uid, id);
  return adminDb.runTransaction(async tx => {
    const snapshot = await tx.get(ref);
    const raw = snapshot.exists ? snapshot.data() : undefined;
    const existing = readFeedback(id, raw);
    const vote = change.vote === undefined ? existing?.vote ?? null : change.vote;
    const saved = change.saved ?? existing?.saved ?? false;
    if (vote === null && !saved) {
      if (snapshot.exists) tx.delete(ref);
      return null;
    }
    const reason = vote === null || change.vote === null ? undefined
      : change.reason === undefined ? existing?.reason : optionalText(change.reason);
    const now = Timestamp.now();
    const record: GenerationFeedback = compact({
      id,
      jokeText: change.jokeText,
      category: change.category === undefined ? existing?.category : optionalText(change.category),
      vote,
      reason,
      saved,
      topicHint: change.topicHint === undefined ? existing?.topicHint : optionalText(change.topicHint),
      model: change.model === undefined ? existing?.model : optionalText(change.model),
      updatedAt: now.toDate().toISOString(),
    });
    const createdAt = existing ? asTimestamp(raw?.createdAt) ?? asTimestamp(raw?.updatedAt) ?? now : now;
    tx.set(ref, compact({
      userId: uid,
      jokeText: record.jokeText, category: record.category, vote: record.vote, reason: record.reason,
      saved: record.saved, topicHint: record.topicHint, model: record.model,
      mode: change.mode ?? (existing ? optionalText(raw?.mode) : undefined),
      requestId: change.requestId === undefined ? (existing ? optionalText(raw?.requestId) : undefined) : optionalText(change.requestId),
      createdAt, updatedAt: now,
    }));
    return record;
  });
}

/**
 * Newest first by updatedAt. Reads at most 500 of the user's documents
 * (equality filter only), skips malformed and empty records, then applies
 * `limit`.
 */
export async function listFeedback(uid: string, limit: number = TASTE_LIMITS.feedbackPage): Promise<GenerationFeedback[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > TASTE_LIMITS.feedbackPage) {
    throw new RangeError(`Feedback limit must be an integer from 1 to ${TASTE_LIMITS.feedbackPage}.`);
  }
  const prefix = `${checkedUid(uid)}_`;
  const snapshot = await userFeedbackQuery(uid).limit(FEEDBACK_READ_CAP).get();
  return snapshot.docs
    .flatMap(doc => {
      if (!doc.id.startsWith(prefix)) return [];
      const feedback = readFeedback(doc.id.slice(prefix.length), doc.data());
      return feedback && !isEmptyFeedback(feedback) ? [feedback] : [];
    })
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
    .slice(0, limit);
}

/** Deletes every feedback document of the user in batches; returns the count. */
export async function clearFeedback(uid: string): Promise<number> {
  let deleted = 0;
  for (;;) {
    const snapshot = await userFeedbackQuery(uid).limit(DELETE_BATCH_SIZE).get();
    if (snapshot.empty) return deleted;
    const batch = adminDb.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    deleted += snapshot.size;
    if (snapshot.size < DELETE_BATCH_SIZE) return deleted;
  }
}

/** Newest first by createdAt; malformed documents are skipped. */
export async function listSamples(uid: string): Promise<JokeSample[]> {
  const snapshot = await samplesCollection(uid).orderBy('createdAt', 'desc').limit(TASTE_LIMITS.maxSamples).get();
  return snapshot.docs.flatMap(doc => readSample(doc.id, doc.data()) ?? []);
}

/**
 * Idempotent by normalized text: an existing sample is returned with
 * `created: false`, re-activated, and its note replaced only when one is given.
 * Throws SampleLimitError when a new sample would exceed the cap.
 */
export async function createSample(uid: string, input: SampleCreate): Promise<{ sample: JokeSample; created: boolean }> {
  const { text, note } = SampleCreateSchema.parse(input);
  const id = tasteDocId(text);
  const collection = samplesCollection(uid);
  const ref = collection.doc(id);
  return adminDb.runTransaction(async tx => {
    const snapshot = await tx.get(ref);
    const now = Timestamp.now();
    if (snapshot.exists) {
      const raw = snapshot.data();
      const existing = readSample(id, raw);
      const createdAt = (existing && asTimestamp(raw?.createdAt)) || now;
      const next = { text: existing?.text ?? text, note: optionalText(note) ?? existing?.note, active: true };
      tx.set(ref, sampleDocument(next, createdAt, now));
      return { sample: readSample(id, sampleDocument(next, createdAt, now))!, created: false };
    }
    const all = await tx.get(collection.select().limit(TASTE_LIMITS.maxSamples));
    if (all.size >= TASTE_LIMITS.maxSamples) throw new SampleLimitError();
    const data = sampleDocument({ text, note: optionalText(note), active: true }, now, now);
    tx.set(ref, data);
    return { sample: readSample(id, data)!, created: true };
  });
}

/** `active`/`note`: undefined leaves unchanged, null (or blank) clears the note. Null when missing. */
export async function updateSample(uid: string, input: SampleUpdate): Promise<JokeSample | null> {
  const change = SampleUpdateSchema.parse(input);
  const ref = samplesCollection(uid).doc(change.id);
  return adminDb.runTransaction(async tx => {
    const snapshot = await tx.get(ref);
    const raw = snapshot.exists ? snapshot.data() : undefined;
    const existing = readSample(change.id, raw);
    if (!existing) return null;
    const next = {
      text: existing.text,
      note: change.note === undefined ? existing.note : optionalText(change.note),
      active: change.active ?? existing.active,
    };
    const data = sampleDocument(next, asTimestamp(raw?.createdAt) ?? Timestamp.now(), Timestamp.now());
    tx.set(ref, data);
    return readSample(change.id, data);
  });
}

/** True when a sample was deleted, false when it did not exist or the id is invalid. */
export async function deleteSample(uid: string, id: string): Promise<boolean> {
  if (!TasteDocIdSchema.safeParse(id).success) return false;
  const ref = samplesCollection(uid).doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) return false;
  await ref.delete();
  return true;
}

function tasteExample(text: string, reason: string | undefined): TasteExample {
  const capped = reason?.slice(0, JOKE_GENERATION_LIMITS.tasteReasonChars).trim();
  return capped ? { text, reason: capped } : { text };
}

/** Error codes are numeric or short identifiers; anything else is dropped from logs. */
function safeErrorCode(error: unknown): string | number | undefined {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  if (typeof code === 'number' && Number.isFinite(code)) return code;
  return typeof code === 'string' && /^[A-Za-z0-9_/-]{1,40}$/.test(code) ? code : undefined;
}

/**
 * Never throws: storage failures yield an empty profile. Active samples
 * (newest first) and, from the newest feedback page, liked
 * (`up`, or saved without a `down`) and disliked (`down`) jokes.
 */
export async function loadTasteProfile(uid: string): Promise<TasteProfile> {
  if (typeof uid !== 'string' || !uid) return emptyTasteProfile();
  try {
    const [samples, feedback] = await Promise.all([listSamples(uid), listFeedback(uid, TASTE_LIMITS.feedbackPage)]);
    const validText = (text: string) => JokeTextSchema.safeParse(text).success;
    const profile = emptyTasteProfile();
    profile.samples = samples
      .filter(sample => sample.active && validText(sample.text))
      .slice(0, JOKE_GENERATION_LIMITS.tasteSamples)
      .map(sample => sample.text);
    for (const item of feedback) {
      if (!validText(item.jokeText)) continue;
      if (item.vote === 'down') {
        if (profile.disliked.length < JOKE_GENERATION_LIMITS.tasteDisliked) profile.disliked.push(tasteExample(item.jokeText, item.reason));
      } else if (item.vote === 'up' || item.saved) {
        if (profile.liked.length < JOKE_GENERATION_LIMITS.tasteLiked) profile.liked.push(tasteExample(item.jokeText, item.reason));
      }
    }
    return profile;
  } catch (error) {
    const code = safeErrorCode(error);
    console.warn(`[taste-profile] load failed; using an empty profile${code === undefined ? '' : ` (code ${code})`}`);
    return emptyTasteProfile();
  }
}
