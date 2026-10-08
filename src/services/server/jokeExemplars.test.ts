// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ get: vi.fn(), order: vi.fn(), limit: vi.fn(), collection: vi.fn() }));
vi.mock('@/lib/admin', () => ({ adminDb: { collection: mocks.collection } }));
const doc = (id: string, overrides: Record<string, unknown> = {}) => ({ id, data: () => ({ text: `Joke ${id}`, averageRating: 4.5, ratingCount: 3, category: 'Work', ...overrides }) });
async function fetcher() { return (await import('./jokeExemplars')).fetchJokeExemplars; }
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  mocks.collection.mockReturnValue({ orderBy: mocks.order });
  mocks.order.mockReturnValue({ limit: mocks.limit });
  mocks.limit.mockReturnValue({ get: mocks.get });
  mocks.get.mockResolvedValue({ docs: [] });
});
afterEach(() => vi.useRealTimers());
it('qualifies both pools, boundaries and compatible valid text only', async () => {
  const bad = [NaN, Infinity, 3.99, 5.01, '5'].map((averageRating, i) => doc(`avg${i}`, { averageRating }));
  bad.push(...[2, 3.5, '3', NaN].map((ratingCount, i) => doc(`count${i}`, { ratingCount })));
  bad.push(doc('blank', { text: '!!!' }), doc('long', { text: 'x'.repeat(2001) }));
  mocks.get.mockResolvedValueOnce({ docs: [...bad, doc('four', { averageRating: 4 })] })
    .mockResolvedValueOnce({ docs: [...bad, doc('five', { averageRating: 5 }), doc('compat', { text: '', jokeText: 'Compatible text', category: 'Space' })] });
  expect(await (await fetcher())()).toEqual(['Joke five', 'Compatible text', 'Joke four']);
  expect(mocks.order.mock.calls).toEqual([['averageRating', 'desc'], ['dateAdded', 'desc']]);
  expect(mocks.limit.mock.calls).toEqual([[50], [50]]);
});
it('round-robins buckets by quality/count/ID; dedups IDs and normalized text', async () => {
  mocks.get.mockResolvedValueOnce({ docs: [doc('b', { averageRating: 5 }), doc('a', { averageRating: 5 }), doc('c', { category: 'Space', ratingCount: 4 }), doc('unknown', { category: null, averageRating: 4 })] })
    .mockResolvedValueOnce({ docs: [doc('a', { text: 'different' }), doc('dup', { text: 'ＪＯＫＥ A!!!' }), doc('d', { category: 'Space' })] });
  expect(await (await fetcher())()).toEqual(['Joke a', 'Joke c', 'Joke unknown', 'Joke b', 'Joke d']);
});
it('fallback on primary error; preserves primary when fallback fails; both failures empty', async () => {
  mocks.get.mockRejectedValueOnce(new Error('primary')).mockResolvedValueOnce({ docs: [doc('fallback')] });
  expect(await (await fetcher())()).toEqual(['Joke fallback']);
  vi.resetModules();
  mocks.get.mockResolvedValueOnce({ docs: [doc('primary')] }).mockRejectedValueOnce(new Error('fallback'));
  expect(await (await fetcher())()).toEqual(['Joke primary']);
  vi.resetModules();
  mocks.get.mockRejectedValue(new Error('offline'));
  expect(await (await fetcher())()).toEqual([]);
});
it('dense varied pool avoids fallback; dense single category still falls back', async () => {
  mocks.get.mockResolvedValue({ docs: Array.from({ length: 10 }, (_, i) => doc(`${i}`, { category: i % 2 ? 'Space' : 'Work' })) });
  expect(await (await fetcher())()).toHaveLength(10);
  expect(mocks.get).toHaveBeenCalledTimes(1);
  vi.resetModules(); vi.clearAllMocks();
  mocks.get.mockResolvedValue({ docs: Array.from({ length: 10 }, (_, i) => doc(`${i}`)) });
  await (await fetcher())();
  expect(mocks.get).toHaveBeenCalledTimes(2);
});
it('caches per validated cap for 60s, copies results, and refetches at expiry', async () => {
  vi.useFakeTimers(); vi.setSystemTime(1000);
  mocks.get.mockResolvedValue({ docs: [doc('a'), doc('b')] });
  const fetch = await fetcher();
  const first = await fetch(1); first.push('mutation');
  expect(await fetch(1)).toEqual(['Joke a']);
  expect(mocks.get).toHaveBeenCalledTimes(2);
  expect(await fetch(2)).toEqual(['Joke a', 'Joke b']);
  expect(mocks.get).toHaveBeenCalledTimes(4);
  vi.advanceTimersByTime(60_000);
  await fetch(1);
  expect(mocks.get).toHaveBeenCalledTimes(6);
  for (const invalid of [0, 11, 1.5, NaN]) await expect(fetch(invalid)).rejects.toThrow(RangeError);
  expect(mocks.get).toHaveBeenCalledTimes(6);
});
