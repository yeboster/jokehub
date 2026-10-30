// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ get: vi.fn(), order: vi.fn(), limit: vi.fn(), collection: vi.fn(), where: vi.fn(), feedback: vi.fn() }));
vi.mock('@/lib/admin', () => ({ adminDb: { collection: mocks.collection } }));
const doc = (id: string, overrides: Record<string, unknown> = {}) => ({ id, data: () => ({ text: `Joke ${id}`, averageRating: 4.5, ratingCount: 1, category: 'Work', ...overrides }) });
async function fetcher() { return (await import('./jokeExemplars')).fetchJokeExemplars; }
async function avoider() { return (await import('./jokeExemplars')).fetchAvoidExamples; }
async function library() { return (await import('./jokeExemplars')).fetchLibraryJokeTexts; }
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  vi.spyOn(Math, 'random').mockReturnValue(0);
  mocks.collection.mockImplementation((name: string) => name === 'generatedJokeFeedback'
    ? { where: mocks.where } : { orderBy: mocks.order });
  mocks.where.mockReturnValue({ limit: () => ({ get: mocks.feedback }) });
  mocks.feedback.mockResolvedValue({ docs: [] });
  mocks.order.mockReturnValue({ limit: mocks.limit });
  mocks.limit.mockReturnValue({ get: mocks.get });
  mocks.get.mockResolvedValue({ docs: [] });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('fetchJokeExemplars', () => {
  it('qualifies jokes rated 4–5 by a single rater, boundaries and compatible valid text only', async () => {
    const bad = [NaN, Infinity, 3.99, 5.01, '5'].map((averageRating, i) => doc(`avg${i}`, { averageRating }));
    bad.push(...[0, 1.5, '3', NaN, undefined].map((ratingCount, i) => doc(`count${i}`, { ratingCount })));
    bad.push(doc('blank', { text: '!!!' }), doc('long', { text: 'x'.repeat(2001) }));
    mocks.get.mockResolvedValueOnce({ docs: [...bad, doc('four', { averageRating: 4 })] })
      .mockResolvedValueOnce({ docs: [...bad, doc('five', { averageRating: 5 }), doc('compat', { text: '', jokeText: 'Compatible text', category: 'Space' })] });
    expect(await (await fetcher())()).toEqual(['Joke five', 'Compatible text', 'Joke four']);
    expect(mocks.order.mock.calls).toEqual([['averageRating', 'desc'], ['dateAdded', 'desc']]);
    expect(mocks.limit.mock.calls).toEqual([[200], [200]]);
  });
  it('defaults to 25 examples so the model sees a real sample of the user taste', async () => {
    mocks.get.mockResolvedValue({ docs: Array.from({ length: 40 }, (_, i) => doc(`${i}`, { category: `C${i % 5}` })) });
    expect(await (await fetcher())()).toHaveLength(25);
  });
  it('puts website-sourced jokes first within each category, then rating, then a random draw', async () => {
    mocks.get.mockResolvedValueOnce({ docs: [
      doc('plain5', { averageRating: 5 }),
      doc('web4', { averageRating: 4, source: 'https://humornama.com/jokes/joke-of-the-day/' }),
      doc('web5', { averageRating: 5, source: 'countryliving.com' }),
      doc('ai5', { averageRating: 5, source: 'AI Assistant' }),
    ] });
    expect(await (await fetcher())(4)).toEqual(['Joke web5', 'Joke web4', 'Joke ai5', 'Joke plain5']);
  });
  it('varies the sample between cache windows instead of always sending the same jokes', async () => {
    vi.useFakeTimers(); vi.setSystemTime(1000);
    const docs = ['a', 'b', 'c'].map(id => doc(id, { averageRating: 5 }));
    mocks.get.mockResolvedValue({ docs });
    const random = vi.mocked(Math.random);
    random.mockReturnValueOnce(0.9).mockReturnValueOnce(0.5).mockReturnValueOnce(0.1);
    const fetch = await fetcher();
    expect(await fetch(1)).toEqual(['Joke c']);
    vi.advanceTimersByTime(60_000);
    random.mockReturnValueOnce(0.1).mockReturnValueOnce(0.5).mockReturnValueOnce(0.9);
    expect(await fetch(1)).toEqual(['Joke a']);
  });
  it('round-robins category buckets; dedups IDs and normalized text', async () => {
    mocks.get.mockResolvedValueOnce({ docs: [doc('b', { averageRating: 5 }), doc('a', { averageRating: 5 }), doc('c', { category: 'Space' }), doc('unknown', { category: null, averageRating: 4 })] })
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
    mocks.get.mockResolvedValue({ docs: Array.from({ length: 25 }, (_, i) => doc(`${i}`, { category: i % 2 ? 'Space' : 'Work' })) });
    expect(await (await fetcher())()).toHaveLength(25);
    expect(mocks.get).toHaveBeenCalledTimes(1);
    vi.resetModules(); vi.clearAllMocks();
    mocks.get.mockResolvedValue({ docs: Array.from({ length: 25 }, (_, i) => doc(`${i}`)) });
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
    for (const invalid of [0, 26, 1.5, NaN]) await expect(fetch(invalid)).rejects.toThrow(RangeError);
    expect(mocks.get).toHaveBeenCalledTimes(6);
  });
});

describe('fetchAvoidExamples', () => {
  it('returns rated 1–2 star jokes only, lowest ratings first, bounded and deduplicated', async () => {
    mocks.get.mockResolvedValueOnce({ docs: [
      doc('unrated', { averageRating: 0, ratingCount: 0 }),
      doc('one', { averageRating: 1 }),
      doc('dup', { averageRating: 1, text: 'joke ONE!' }),
      doc('two', { averageRating: 2 }),
      doc('three', { averageRating: 3 }),
      doc('blank', { averageRating: 1, text: '...' }),
    ] });
    expect(await (await avoider())()).toEqual(['Joke one', 'Joke two']);
    expect(mocks.order).toHaveBeenCalledWith('averageRating', 'asc');
    expect(mocks.limit).toHaveBeenCalledWith(100);
  });
  it('caps the list and samples it so one bad batch does not dominate every prompt', async () => {
    mocks.get.mockResolvedValue({ docs: Array.from({ length: 20 }, (_, i) => doc(`${i}`, { averageRating: 1 })) });
    expect(await (await avoider())()).toHaveLength(6);
  });
  it('leads with the most recent thumbs-down generated jokes, then low-rated library jokes', async () => {
    const vote = (id: string, jokeText: string, at: number) => ({ id, data: () => ({ jokeText, vote: 'down', updatedAt: { toMillis: () => at } }) });
    mocks.feedback.mockResolvedValueOnce({ docs: [vote('old', 'Old dud', 1), vote('new', 'New dud', 3), vote('mid', 'Mid dud', 2), vote('x', 'Joke one', 4), vote('older', 'Oldest dud', 0)] });
    mocks.get.mockResolvedValueOnce({ docs: [doc('one', { averageRating: 1 }), doc('two', { averageRating: 2 })] });
    expect(await (await avoider())()).toEqual(['Joke one', 'New dud', 'Mid dud', 'Old dud', 'Joke two']);
    expect(mocks.where).toHaveBeenCalledWith('vote', '==', 'down');
  });
  it('degrades to no examples when the read fails', async () => {
    mocks.get.mockRejectedValue(new Error('offline'));
    mocks.feedback.mockRejectedValue(new Error('offline'));
    expect(await (await avoider())()).toEqual([]);
  });
});

describe('fetchLibraryJokeTexts', () => {
  it('returns every valid library text regardless of rating, newest first and bounded', async () => {
    mocks.get.mockResolvedValueOnce({ docs: [doc('a', { averageRating: null }), doc('b', { text: '', jokeText: 'Compatible text' }), doc('blank', { text: '!!!' })] });
    expect(await (await library())()).toEqual(['Joke a', 'Compatible text']);
    expect(mocks.order).toHaveBeenCalledWith('dateAdded', 'desc');
    expect(mocks.limit).toHaveBeenCalledWith(1000);
  });
  it('caches for 60s and degrades to an empty library when the read fails', async () => {
    mocks.get.mockResolvedValue({ docs: [doc('a')] });
    const fetch = await library();
    await fetch(); await fetch();
    expect(mocks.get).toHaveBeenCalledTimes(1);
    vi.resetModules(); mocks.get.mockRejectedValue(new Error('offline'));
    expect(await (await library())()).toEqual([]);
  });
});
