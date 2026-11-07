import { describe, expect, it, vi } from 'vitest';
import {
  STUDIO_BATCH_LIMIT, clearAllStoredBatches, prependBatch, readStoredBatches, recentGeneratedHistory, studioBatchesKey, writeStoredBatches,
  type StudioBatch,
} from './studioBatches';

const batch = (n: number, jokes = 3): StudioBatch => ({
  id: `b${n}`, createdAt: '2026-11-07T10:00:00.000Z', topicHint: '', mode: 'original', model: 'googleai/gemini-3.5-flash-lite', requestId: null, requestedCount: 3,
  jokes: Array.from({ length: jokes }, (_, i) => ({ id: `b${n}-${i}`, jokeText: `batch ${n} joke ${i}`, category: 'Work', status: 'idle', vote: null })),
});

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { data.set(key, value); }),
    removeItem: vi.fn((key: string) => { data.delete(key); }),
    data,
  };
}

describe('studio batch storage', () => {
  it('round-trips batches per uid and turns interrupted saves back into idle', () => {
    const storage = memoryStorage();
    const saving = batch(1); saving.jokes[0].status = 'saving';
    writeStoredBatches(storage, 'a', [saving]);
    expect(storage.data.has(studioBatchesKey('a'))).toBe(true);
    expect(readStoredBatches(storage, 'b')).toEqual([]);
    expect(readStoredBatches(storage, 'a')[0].jokes[0].status).toBe('idle');
  });

  it.each([
    ['missing storage', null],
    ['throwing getItem', { getItem: () => { throw new Error('denied'); }, setItem: () => {}, removeItem: () => {} }],
    ['invalid JSON', memoryStorage({ [studioBatchesKey('a')]: '{oops' })],
    ['invalid shape', memoryStorage({ [studioBatchesKey('a')]: JSON.stringify([{ id: 1 }]) })],
  ])('reads %s as no batches', (_name, storage) => {
    expect(readStoredBatches(storage, 'a')).toEqual([]);
  });

  it('caps stored batches and swallows write failures', () => {
    const storage = memoryStorage({ [studioBatchesKey('a')]: JSON.stringify([1, 2, 3, 4, 5, 6, 7].map(n => batch(n))) });
    expect(readStoredBatches(storage, 'a').map(b => b.id)).toEqual(['b1', 'b2', 'b3', 'b4', 'b5']);
    expect(() => writeStoredBatches({ getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => {} }, 'a', [batch(1)])).not.toThrow();
    expect(() => writeStoredBatches(null, 'a', [batch(1)])).not.toThrow();
  });
});

it('clears every account\'s batches and nothing else', () => {
  sessionStorage.clear();
  writeStoredBatches(sessionStorage, 'a', [batch(1)]); writeStoredBatches(sessionStorage, 'b', [batch(2)]);
  sessionStorage.setItem('other', 'kept');
  clearAllStoredBatches(sessionStorage);
  expect(readStoredBatches(sessionStorage, 'a')).toEqual([]);
  expect(readStoredBatches(sessionStorage, 'b')).toEqual([]);
  expect(sessionStorage.getItem('other')).toBe('kept');
  expect(() => clearAllStoredBatches({ get length(): number { throw new Error('blocked'); }, key: () => null, removeItem: () => {} })).not.toThrow();
});

describe('batch list helpers', () => {
  it('prepends new batches and keeps the newest five', () => {
    let batches: StudioBatch[] = [];
    for (let n = 1; n <= 7; n++) batches = prependBatch(batches, batch(n));
    expect(STUDIO_BATCH_LIMIT).toBe(5);
    expect(batches.map(b => b.id)).toEqual(['b7', 'b6', 'b5', 'b4', 'b3']);
  });

  it('derives newest-first deduplicated history capped to the request limit', () => {
    const newest = batch(2); newest.jokes[0].jokeText = 'BATCH 1 JOKE 1!!!';
    const history = recentGeneratedHistory([newest, batch(1)]);
    expect(history).toEqual(['BATCH 1 JOKE 1!!!', 'batch 2 joke 1', 'batch 2 joke 2', 'batch 1 joke 0', 'batch 1 joke 2']);
    expect(recentGeneratedHistory([5, 4, 3, 2, 1].map(n => batch(n)))).toHaveLength(12);
  });
});
