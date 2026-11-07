// @vitest-environment node
import { createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JOKE_GENERATION_LIMITS, normalizeJokeKey } from '@/lib/jokeGenerationContract';
import { TASTE_LIMITS } from '@/lib/tasteProfile';

/** In-memory stand-in for the slice of the Admin Firestore API the store uses. */
type Data = Record<string, unknown>;
type QueryLog = { path: string; filters: Array<[string, string, unknown]>; order?: [string, string]; max?: number };
class FakeDb {
  docs = new Map<string, Data>();
  queries: QueryLog[] = [];
  transactions = 0;
  directWrites = 0;
  batchSizes: number[] = [];
  failWith: Error | null = null;
  /** Deployed composite indexes, as `${collection}:${equalityFields}:${orderField}`. */
  indexes = new Set<string>();
  collection(path: string) { this.check(); return new FakeQuery(this, path); }
  check() { if (this.failWith) throw this.failWith; }
  async runTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    this.check();
    this.transactions++;
    const pending: Array<() => void> = [];
    let wrote = false;
    const tx = {
      get: (target: FakeDoc | FakeQuery) => {
        if (wrote) throw new Error('Firestore transactions require all reads before writes');
        return target.get();
      },
      set: (ref: FakeDoc, data: Data) => { wrote = true; pending.push(() => this.docs.set(ref.path, checked(data))); },
      delete: (ref: FakeDoc) => { wrote = true; pending.push(() => this.docs.delete(ref.path)); },
    };
    const result = await fn(tx);
    pending.forEach(apply => apply());
    return result;
  }
  batch() {
    const deletes: FakeDoc[] = [];
    return {
      delete: (ref: FakeDoc) => { deletes.push(ref); },
      commit: async () => {
        if (deletes.length > 400) throw new Error('batch too large');
        this.batchSizes.push(deletes.length);
        deletes.forEach(ref => this.docs.delete(ref.path));
      },
    };
  }
}
function checked(data: Data): Data {
  for (const value of Object.values(data)) if (value === undefined) throw new Error('Firestore rejects undefined values');
  return { ...data };
}
class FakeDoc {
  constructor(private db: FakeDb, readonly path: string) {}
  get id() { return this.path.split('/').pop()!; }
  collection(name: string) { return new FakeQuery(this.db, `${this.path}/${name}`); }
  async get() {
    const data = this.db.docs.get(this.path);
    return { id: this.id, ref: this, exists: data !== undefined, data: () => (data ? { ...data } : undefined) };
  }
  async set(data: Data) { this.db.directWrites++; this.db.docs.set(this.path, checked(data)); }
  async delete() { this.db.directWrites++; this.db.docs.delete(this.path); }
}
const millis = (value: unknown) => (value instanceof Timestamp ? value.toMillis() : undefined);
class FakeQuery {
  constructor(
    private db: FakeDb, readonly path: string,
    private filters: Array<[string, string, unknown]> = [], private order?: [string, 'asc' | 'desc'], private max?: number,
  ) {}
  doc(id: string) { return new FakeDoc(this.db, `${this.path}/${id}`); }
  where(field: string, op: string, value: unknown) {
    if (op !== '==') throw new Error('only equality filters are used');
    return new FakeQuery(this.db, this.path, [...this.filters, [field, op, value]], this.order, this.max);
  }
  orderBy(field: string, direction: 'asc' | 'desc' = 'asc') {
    return new FakeQuery(this.db, this.path, this.filters, [field, direction], this.max);
  }
  limit(max: number) { return new FakeQuery(this.db, this.path, this.filters, this.order, max); }
  select() { return this; }
  async get() {
    this.db.check();
    if (this.filters.length && this.order && !this.db.indexes.has(`${this.path}:${this.filters.map(([f]) => f).join(',')}:${this.order[0]}`)) {
      // Like the Admin SDK: a where + orderBy query fails at get() until its composite index exists.
      throw Object.assign(new Error('9 FAILED_PRECONDITION: The query requires an index. You can create it here: https://console.firebase.google.com/x'), { code: 9 });
    }
    this.db.queries.push({ path: this.path, filters: this.filters, order: this.order, max: this.max });
    const depth = this.path.split('/').length + 1;
    let entries = [...this.db.docs.entries()].filter(([path]) => path.startsWith(`${this.path}/`) && path.split('/').length === depth);
    entries = entries.filter(([, data]) => this.filters.every(([field, , value]) => data[field] === value));
    if (this.order) {
      const [field, direction] = this.order;
      // Like Firestore, documents without a comparable ordered field are excluded.
      entries = entries.filter(([, data]) => millis(data[field]) !== undefined);
      entries.sort(([, a], [, b]) => (millis(a[field])! - millis(b[field])!) * (direction === 'desc' ? -1 : 1));
    }
    if (this.max !== undefined) entries = entries.slice(0, this.max);
    const docs = entries.map(([path, data]) => ({ id: path.split('/').pop()!, ref: new FakeDoc(this.db, path), exists: true, data: () => ({ ...data }) }));
    return { docs, size: docs.length, empty: docs.length === 0 };
  }
}

const state = vi.hoisted(() => ({ db: null as unknown as FakeDb }));
vi.mock('@/lib/admin', () => ({
  adminDb: {
    collection: (path: string) => state.db.collection(path),
    runTransaction: (fn: (tx: unknown) => Promise<unknown>) => state.db.runTransaction(fn),
    batch: () => state.db.batch(),
  },
}));

import {
  SampleLimitError, clearFeedback, createSample, deleteSample, listFeedback, listSamples,
  loadTasteProfile, summarizeFeedback, tasteDocId, updateSample, upsertFeedback,
} from './tasteStore';

const UID = 'user-1';
const OTHER = 'user-2';
const feedbackPath = (id: string, uid = UID) => `generatedJokeFeedback/${uid}_${id}`;
const samplePath = (id: string) => `users/${UID}/jokeSamples/${id}`;
const expectedId = (text: string) => createHash('sha256').update(normalizeJokeKey(text)).digest('hex').slice(0, 32);
const at = (ms: number) => Timestamp.fromMillis(ms);
const stored = (text: string, uid = UID) => state.db.docs.get(feedbackPath(expectedId(text), uid));
let clock = 1_000_000;
const tick = () => { clock += 1000; vi.setSystemTime(clock); };

beforeEach(() => {
  state.db = new FakeDb();
  vi.useFakeTimers({ toFake: ['Date'] });
  clock = 1_000_000;
  vi.setSystemTime(clock);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('tasteDocId', () => {
  it('is the first 32 hex chars of sha256(normalizeJokeKey(text)), equal for differently formatted equal texts', () => {
    expect(tasteDocId('Why did the chicken cross?')).toBe(expectedId('Why did the chicken cross?'));
    expect(tasteDocId('  WHY did the   chicken cross!! ')).toBe(tasteDocId('why did the chicken cross'));
    expect(tasteDocId('Ｗｈｙ did the chicken cross?')).toBe(tasteDocId('why did the chicken cross'));
    expect(tasteDocId('A different joke')).not.toBe(tasteDocId('why did the chicken cross'));
    expect(tasteDocId('x')).toMatch(/^[a-f0-9]{32}$/);
  });
});

describe('upsertFeedback', () => {
  it('writes generatedJokeFeedback/{uid}_{hash} in a transaction with the existing fields plus saved/reason/createdAt', async () => {
    const result = await upsertFeedback(UID, {
      jokeText: 'Joke one', vote: 'up', reason: '  clever  ', category: 'Work', topicHint: 'office',
      model: 'googleai/gemini-3.6-flash', mode: 'classic', requestId: 'req-1',
    });
    const id = expectedId('Joke one');
    expect(result).toEqual({
      id, jokeText: 'Joke one', vote: 'up', reason: 'clever', saved: false, category: 'Work',
      topicHint: 'office', model: 'googleai/gemini-3.6-flash', updatedAt: new Date(clock).toISOString(),
    });
    const doc = state.db.docs.get(feedbackPath(id))!;
    expect(doc).toMatchObject({
      userId: UID, jokeText: 'Joke one', vote: 'up', saved: false, reason: 'clever', category: 'Work',
      topicHint: 'office', model: 'googleai/gemini-3.6-flash', mode: 'classic', requestId: 'req-1',
    });
    expect(millis(doc.createdAt)).toBe(clock);
    expect(millis(doc.updatedAt)).toBe(clock);
    expect(state.db.transactions).toBe(1);
    expect(state.db.directWrites).toBe(0);
  });

  it('keeps users apart: the same text for two users is two documents', async () => {
    await upsertFeedback(UID, { jokeText: 'Joke one', vote: 'up' });
    await upsertFeedback(OTHER, { jokeText: 'joke ONE', vote: 'down' });
    expect(stored('Joke one')).toMatchObject({ userId: UID, vote: 'up' });
    expect(stored('Joke one', OTHER)).toMatchObject({ userId: OTHER, vote: 'down' });
  });

  it('merges: undefined leaves vote/reason/saved/mode/requestId unchanged, null clears, createdAt is preserved', async () => {
    await upsertFeedback(UID, { jokeText: 'Joke one', vote: 'down', reason: 'too long', mode: 'original', requestId: 'r1' });
    tick();
    const saved = await upsertFeedback(UID, { jokeText: 'joke ONE!', saved: true });
    expect(saved).toMatchObject({ vote: 'down', reason: 'too long', saved: true, jokeText: 'joke ONE!' });
    expect(stored('Joke one')).toMatchObject({ mode: 'original', requestId: 'r1' });
    tick();
    const reasonCleared = await upsertFeedback(UID, { jokeText: 'Joke one', reason: null });
    expect(reasonCleared).toMatchObject({ vote: 'down', saved: true });
    expect(reasonCleared).not.toHaveProperty('reason');
    expect(millis(stored('Joke one')!.createdAt)).toBe(1_000_000);
    expect(millis(stored('Joke one')!.updatedAt)).toBe(clock);
    expect(stored('Joke one')).not.toHaveProperty('reason');
  });

  it('a vote change without a reason drops the old reason (old-format clients send no reason)', async () => {
    await upsertFeedback(UID, { jokeText: 'Joke one', vote: 'up', reason: 'clever wordplay' });
    const flipped = await upsertFeedback(UID, { jokeText: 'Joke one', vote: 'down' });
    expect(flipped).toMatchObject({ vote: 'down' });
    expect(flipped).not.toHaveProperty('reason');
    expect(stored('Joke one')).not.toHaveProperty('reason');
    await upsertFeedback(UID, { jokeText: 'Joke one', reason: 'too long' });
    expect(await upsertFeedback(UID, { jokeText: 'Joke one', vote: 'down' })).toMatchObject({ vote: 'down', reason: 'too long' });
  });

  it('clearing the vote (null or legacy "none") also clears the reason and never stores "none"', async () => {
    await upsertFeedback(UID, { jokeText: 'Joke one', vote: 'up', reason: 'great', saved: true });
    const cleared = await upsertFeedback(UID, { jokeText: 'Joke one', vote: 'none' });
    expect(cleared).toMatchObject({ vote: null, saved: true });
    expect(cleared).not.toHaveProperty('reason');
    expect(stored('Joke one')!.vote).toBeNull();
    const reasonOnly = await upsertFeedback(UID, { jokeText: 'Joke two', saved: true, reason: 'ignored' });
    expect(reasonOnly).not.toHaveProperty('reason');
  });

  it.each([
    ['vote cleared on an unsaved record', { vote: 'up' as const }, { vote: null }],
    ['legacy "none" on an unsaved record', { vote: 'down' as const }, { vote: 'none' as const }],
    ['unsaved with no vote', { saved: true }, { saved: false }],
    ['both cleared at once', { vote: 'down' as const, saved: true }, { vote: null, saved: false }],
  ])('deletes the document and returns null when %s', async (_name, first, second) => {
    await upsertFeedback(UID, { jokeText: 'Joke one', ...first });
    expect(await upsertFeedback(UID, { jokeText: 'Joke one', ...second })).toBeNull();
    expect(stored('Joke one')).toBeUndefined();
  });

  it('returns null without writing when a new record would be empty', async () => {
    expect(await upsertFeedback(UID, { jokeText: 'Joke one', vote: null, saved: false })).toBeNull();
    expect(await upsertFeedback(UID, { jokeText: 'Joke one', vote: 'none' })).toBeNull();
    expect(await upsertFeedback(UID, { jokeText: 'Joke one' })).toBeNull();
    expect(state.db.docs.size).toBe(0);
  });

  it('reads legacy documents (vote "none", no saved/createdAt) and deletes them when they stay empty', async () => {
    state.db.docs.set(feedbackPath(expectedId('Legacy')), { userId: UID, jokeText: 'Legacy', category: 'Work', vote: 'none', updatedAt: at(500) });
    expect(await upsertFeedback(UID, { jokeText: 'Legacy', category: 'Space' })).toBeNull();
    expect(stored('Legacy')).toBeUndefined();

    state.db.docs.set(feedbackPath(expectedId('Legacy kept')), { userId: UID, jokeText: 'Legacy kept', category: 'Work', topicHint: 'office', vote: 'none', updatedAt: at(700) });
    expect(await upsertFeedback(UID, { jokeText: 'Legacy kept', saved: true })).toMatchObject({ vote: null, saved: true, category: 'Work', topicHint: 'office' });
    expect(millis(stored('Legacy kept')!.createdAt)).toBe(700);
    expect(stored('Legacy kept')!.vote).toBeNull();

    state.db.docs.set(feedbackPath(expectedId('Old up')), { userId: UID, jokeText: 'Old up', category: 'Work', vote: 'up', mode: 'classic', updatedAt: at(500) });
    expect(await upsertFeedback(UID, { jokeText: 'Old up', saved: true })).toMatchObject({ vote: 'up', saved: true, category: 'Work' });
    expect(millis(stored('Old up')!.createdAt)).toBe(500);
    expect(stored('Old up')).toMatchObject({ mode: 'classic', userId: UID });
  });

  it('keeps category/topicHint/model when undefined and replaces them when given', async () => {
    await upsertFeedback(UID, { jokeText: 'Joke one', vote: 'up', category: 'Work', topicHint: 'office', model: 'm1' });
    expect(await upsertFeedback(UID, { jokeText: 'Joke one', saved: true })).toMatchObject({ category: 'Work', topicHint: 'office', model: 'm1' });
    expect(await upsertFeedback(UID, { jokeText: 'Joke one', category: 'Space', model: 'm2' })).toMatchObject({ category: 'Space', topicHint: 'office', model: 'm2' });
  });

  it('overwrites a malformed stored record instead of crashing', async () => {
    const id = expectedId('Joke one');
    state.db.docs.set(feedbackPath(id), { userId: UID, jokeText: 42, vote: 'meh', saved: 'yes' });
    expect(await upsertFeedback(UID, { jokeText: 'Joke one', vote: 'up' })).toMatchObject({ id, vote: 'up', saved: false });
  });
});

describe('listFeedback', () => {
  const seed = (text: string, updatedMs: number, extra: Data = {}, uid = UID) =>
    state.db.docs.set(feedbackPath(expectedId(text), uid), { userId: uid, jokeText: text, vote: 'up', saved: false, createdAt: at(updatedMs), updatedAt: at(updatedMs), ...extra });

  it('with the composite index deployed, reads the newest 500 by updatedAt so new votes are never cut off', async () => {
    state.db.indexes.add('generatedJokeFeedback:userId:updatedAt');
    for (let i = 0; i < 600; i++) seed(`Joke ${i}`, 1000 + i);
    const all = await listFeedback(UID);
    expect(all[0].jokeText).toBe('Joke 599');
    expect(state.db.queries.at(-1)).toEqual({ path: 'generatedJokeFeedback', filters: [['userId', '==', UID]], order: ['updatedAt', 'desc'], max: 500 });
  });

  it('falls back to the unordered read when the index is missing, warning without user data', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    seed('Old', 1000);
    seed('New', 3000);
    expect((await listFeedback(UID)).map(item => item.jokeText)).toEqual(['New', 'Old']);
    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain(UID);
  });

  it('summarizes counts over every read record, not just the returned page', async () => {
    seed('Up 1', 1000);
    seed('Up 2', 2000);
    seed('Saved', 3000, { vote: null, saved: true });
    seed('Down', 4000, { vote: 'down', saved: true });
    const summary = await summarizeFeedback(UID, 1);
    expect(summary.feedback.map(item => item.jokeText)).toEqual(['Down']);
    expect(summary.counts).toEqual({ liked: 3, disliked: 1 });
  });

  it('reads with an equality-only userId filter capped at 500, then sorts newest first in memory', async () => {
    seed('Old', 1000);
    seed('New', 3000, { reason: 'nice', category: 'Work' });
    seed('Mid', 2000, { vote: null, saved: true });
    seed('Someone else', 9000, {}, OTHER);
    const all = await listFeedback(UID);
    expect(all.map(item => item.jokeText)).toEqual(['New', 'Mid', 'Old']);
    expect(all[0]).toEqual({ id: expectedId('New'), jokeText: 'New', vote: 'up', saved: false, reason: 'nice', category: 'Work', updatedAt: new Date(3000).toISOString() });
    expect(state.db.queries.at(-1)).toEqual({ path: 'generatedJokeFeedback', filters: [['userId', '==', UID]], order: undefined, max: 500 });
    expect((await listFeedback(UID, 2)).map(item => item.jokeText)).toEqual(['New', 'Mid']);
  });

  it('reads legacy docs and skips malformed or empty ones before applying the limit', async () => {
    seed('Legacy down', 4000, { vote: 'down', saved: undefined, createdAt: undefined });
    seed('Legacy none', 8000, { vote: 'none', saved: undefined, createdAt: undefined });
    seed('Bad text', 7000, { jokeText: 42 });
    seed('Bad vote', 7000, { vote: 'meh' });
    seed('Bad saved', 7000, { saved: 'yes' });
    state.db.docs.set(`generatedJokeFeedback/${UID}_not-a-hash`, { userId: UID, jokeText: 'Bad id', vote: 'up', saved: false, updatedAt: at(9000) });
    seed('Good', 1000);
    expect(await listFeedback(UID, 2)).toEqual([
      { id: expectedId('Legacy down'), jokeText: 'Legacy down', vote: 'down', saved: false, updatedAt: new Date(4000).toISOString() },
      { id: expectedId('Good'), jokeText: 'Good', vote: 'up', saved: false, updatedAt: new Date(1000).toISOString() },
    ]);
  });

  it('rejects out-of-range limits', async () => {
    for (const bad of [0, 101, 1.5, NaN]) await expect(listFeedback(UID, bad)).rejects.toThrow(RangeError);
  });
});

describe('clearFeedback', () => {
  it("deletes only the user's documents in batches of at most 400 until none remain", async () => {
    for (let i = 0; i < 901; i++) state.db.docs.set(feedbackPath(`doc${i}`), { userId: UID, jokeText: `Joke ${i}`, vote: 'up' });
    state.db.docs.set(feedbackPath('theirs', OTHER), { userId: OTHER, jokeText: 'Theirs', vote: 'down' });
    state.db.docs.set(samplePath('keep'), { text: 'Sample', active: true });
    expect(await clearFeedback(UID)).toBe(901);
    expect(state.db.batchSizes).toEqual([400, 400, 101]);
    expect([...state.db.docs.keys()].sort()).toEqual([feedbackPath('theirs', OTHER), samplePath('keep')].sort());
    expect(state.db.queries.every(query => query.filters.some(([field, , value]) => field === 'userId' && value === UID) || query.path !== 'generatedJokeFeedback')).toBe(true);
    expect(await clearFeedback(UID)).toBe(0);
  });
});

describe('samples', () => {
  it('creates a new active sample in a transaction, newest first in listSamples', async () => {
    const first = await createSample(UID, { text: 'Sample one', note: '  short  ' });
    expect(first).toEqual({ created: true, sample: { id: expectedId('Sample one'), text: 'Sample one', note: 'short', active: true, createdAt: new Date(clock).toISOString(), updatedAt: new Date(clock).toISOString() } });
    tick();
    await createSample(UID, { text: 'Sample two' });
    expect((await listSamples(UID)).map(sample => sample.text)).toEqual(['Sample two', 'Sample one']);
    expect(state.db.transactions).toBe(2);
    expect(state.db.directWrites).toBe(0);
  });

  it('returns an existing equal sample with created false, re-activating it and keeping its note unless a new one is given', async () => {
    await createSample(UID, { text: 'Sample one', note: 'keep me' });
    await updateSample(UID, { id: expectedId('Sample one'), active: false });
    tick();
    const again = await createSample(UID, { text: 'SAMPLE one!!' });
    expect(again.created).toBe(false);
    expect(again.sample).toMatchObject({ text: 'Sample one', note: 'keep me', active: true, createdAt: new Date(1_000_000).toISOString(), updatedAt: new Date(clock).toISOString() });
    expect((await createSample(UID, { text: 'Sample one', note: 'new note' })).sample.note).toBe('new note');
  });

  it('throws SampleLimitError at the cap but still returns existing duplicates', async () => {
    for (let i = 0; i < TASTE_LIMITS.maxSamples; i++) {
      state.db.docs.set(samplePath(expectedId(`Sample ${i}`)), { text: `Sample ${i}`, active: i % 2 === 0, createdAt: at(i), updatedAt: at(i) });
    }
    const error = await createSample(UID, { text: 'One too many' }).catch(err => err);
    expect(error).toBeInstanceOf(SampleLimitError);
    expect(error.code).toBe('SAMPLE_LIMIT');
    expect(state.db.docs.has(samplePath(expectedId('One too many')))).toBe(false);
    const existing = await createSample(UID, { text: 'sample 1' });
    expect(existing).toMatchObject({ created: false, sample: { text: 'Sample 1', active: true } });
  });

  it('updates active and note (undefined unchanged, null clears) and returns null for a missing sample', async () => {
    await createSample(UID, { text: 'Sample one', note: 'n' });
    const id = expectedId('Sample one');
    tick();
    expect(await updateSample(UID, { id, active: false })).toMatchObject({ active: false, note: 'n', updatedAt: new Date(clock).toISOString() });
    const cleared = await updateSample(UID, { id, note: null });
    expect(cleared).toMatchObject({ active: false });
    expect(cleared).not.toHaveProperty('note');
    expect(state.db.docs.get(samplePath(id))).not.toHaveProperty('note');
    expect(await updateSample(UID, { id: expectedId('missing'), active: true })).toBeNull();
  });

  it('deletes a sample and reports whether it existed', async () => {
    await createSample(UID, { text: 'Sample one' });
    const id = expectedId('Sample one');
    expect(await deleteSample(UID, id)).toBe(true);
    expect(await deleteSample(UID, id)).toBe(false);
    expect(await deleteSample(UID, '../../escape')).toBe(false);
  });

  it('skips malformed sample docs when listing', async () => {
    state.db.docs.set(samplePath(expectedId('good')), { text: 'Good', active: true, createdAt: at(10), updatedAt: at(10) });
    state.db.docs.set(samplePath(expectedId('bad')), { text: 7, active: true, createdAt: at(20), updatedAt: at(20) });
    state.db.docs.set(samplePath(expectedId('bad2')), { text: 'No active', active: 'yes', createdAt: at(30), updatedAt: at(30) });
    expect((await listSamples(UID)).map(sample => sample.text)).toEqual(['Good']);
  });
});

describe('loadTasteProfile', () => {
  const feedback = (text: string, ms: number, data: Data, uid = UID) =>
    state.db.docs.set(feedbackPath(expectedId(text), uid), { userId: uid, jokeText: text, saved: false, vote: null, createdAt: at(ms), updatedAt: at(ms), ...data });
  const sample = (text: string, ms: number, active = true) =>
    state.db.docs.set(samplePath(expectedId(text)), { text, active, createdAt: at(ms), updatedAt: at(ms) });

  it("partitions the user's liked/disliked with reasons, newest first, and returns active samples newest first", async () => {
    feedback('Up vote', 6, { vote: 'up', reason: 'clever' });
    feedback('Saved only', 5, { saved: true });
    feedback('Saved but down', 4, { saved: true, vote: 'down', reason: 'r'.repeat(300) });
    feedback('Legacy down', 3, { vote: 'down', saved: undefined, createdAt: undefined });
    feedback('Legacy none', 2, { vote: 'none', saved: undefined });
    feedback('!!!', 7, { vote: 'up' });
    feedback('x'.repeat(2001), 8, { vote: 'down' });
    feedback('Other user', 9, { vote: 'up' }, OTHER);
    sample('Old sample', 1);
    sample('Inactive sample', 2, false);
    sample('New sample', 3);
    expect(await loadTasteProfile(UID)).toEqual({
      samples: ['New sample', 'Old sample'],
      liked: [{ text: 'Up vote', reason: 'clever' }, { text: 'Saved only' }],
      disliked: [{ text: 'Saved but down', reason: 'r'.repeat(JOKE_GENERATION_LIMITS.tasteReasonChars) }, { text: 'Legacy down' }],
    });
  });

  it('caps samples, liked and disliked and reads only the newest feedback page', async () => {
    for (let i = 0; i < 15; i++) sample(`Sample ${i}`, i);
    for (let i = 0; i < 15; i++) feedback(`Liked ${i}`, 1000 + i, { vote: 'up' });
    for (let i = 0; i < 15; i++) feedback(`Disliked ${i}`, 2000 + i, { vote: 'down' });
    for (let i = 0; i < TASTE_LIMITS.feedbackPage; i++) feedback(`Recent saved ${i}`, 5000 + i, { saved: true, vote: null });
    for (let i = 0; i < 3; i++) feedback(`Recent down ${i}`, 9000 + i, { vote: 'down' });
    const profile = await loadTasteProfile(UID);
    expect(profile.samples).toHaveLength(JOKE_GENERATION_LIMITS.tasteSamples);
    expect(profile.samples[0]).toBe('Sample 14');
    // Older liked/disliked fall outside the newest feedback page.
    expect(profile.disliked.map(item => item.text)).toEqual(['Recent down 2', 'Recent down 1', 'Recent down 0']);
    expect(profile.liked.every(item => item.text.startsWith('Recent saved'))).toBe(true);
    state.db.docs.clear();
    for (let i = 0; i < 15; i++) feedback(`Liked ${i}`, 1000 + i, { vote: 'up' });
    for (let i = 0; i < 15; i++) feedback(`Disliked ${i}`, 2000 + i, { vote: 'down' });
    const capped = await loadTasteProfile(UID);
    expect(capped.liked).toHaveLength(JOKE_GENERATION_LIMITS.tasteLiked);
    expect(capped.disliked).toHaveLength(JOKE_GENERATION_LIMITS.tasteDisliked);
    expect(capped.liked[0].text).toBe('Liked 14');
  });

  it('never throws and logs a sanitized one-line warning without joke text or ids', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    state.db.failWith = Object.assign(new Error(`read failed at generatedJokeFeedback/${UID}_x for "PRIVATE JOKE"`), { code: 14 });
    expect(await loadTasteProfile(UID)).toEqual({ samples: [], liked: [], disliked: [] });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]).toHaveLength(1);
    const logged = warn.mock.calls[0][0];
    expect(typeof logged).toBe('string');
    expect(logged).not.toContain('\n');
    expect(logged).not.toContain(UID);
    expect(logged).not.toContain('PRIVATE JOKE');
    expect(logged).toContain('14');
  });

  it('returns an empty profile for an empty uid without touching storage', async () => {
    const collection = vi.spyOn(state.db, 'collection');
    expect(await loadTasteProfile('')).toEqual({ samples: [], liked: [], disliked: [] });
    expect(collection).not.toHaveBeenCalled();
  });
});
