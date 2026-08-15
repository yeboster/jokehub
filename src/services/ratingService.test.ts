import { describe, it, expect, beforeEach, vi } from 'vitest';

const { transactionMock, docSnapshots } = vi.hoisted(() => {
  return {
    transactionMock: {
      get: vi.fn(),
      set: vi.fn(),
      update: vi.fn(),
    },
    docSnapshots: new Map<string, { exists: () => boolean; data: () => unknown }>(),
  };
});

vi.mock('@/lib/firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  Timestamp: { now: vi.fn(() => 'MOCK_NOW') },
  doc: vi.fn((_db: unknown, collectionName: string, id: string) => ({ path: `${collectionName}/${id}` })),
  runTransaction: vi.fn(async (_db: unknown, callback: (t: typeof transactionMock) => unknown) =>
    callback(transactionMock)
  ),
}));

import { submitUserRating } from '@/services/ratingService';

function makeSnap(exists: boolean, data?: unknown) {
  return { exists: () => exists, data: () => data };
}

function setJokeDoc(jokeId: string, data: unknown) {
  docSnapshots.set(`jokes/${jokeId}`, makeSnap(true, data));
}

function setRatingDoc(ratingId: string, exists: boolean, data?: unknown) {
  docSnapshots.set(`jokeRatings/${ratingId}`, makeSnap(exists, data));
}

beforeEach(() => {
  vi.clearAllMocks();
  docSnapshots.clear();
  transactionMock.get.mockImplementation((ref: { path: string }) => {
    return docSnapshots.get(ref.path) ?? makeSnap(false, undefined);
  });
});

describe('submitUserRating', () => {
  it('rejects out-of-range star values without touching Firestore', async () => {
    await expect(submitUserRating('joke1', 0, 'user1')).rejects.toThrow(
      'Rating must be between 1 and 5 stars.'
    );
    await expect(submitUserRating('joke1', 6, 'user1')).rejects.toThrow(
      'Rating must be between 1 and 5 stars.'
    );
    expect(transactionMock.update).not.toHaveBeenCalled();
  });

  it('rejects comments longer than 1000 characters', async () => {
    await expect(submitUserRating('joke1', 5, 'user1', 'x'.repeat(1001))).rejects.toThrow(
      'Comment cannot exceed 1000 characters.'
    );
  });

  it('throws when the joke does not exist', async () => {
    setRatingDoc('joke1_user1', false);
    await expect(submitUserRating('joke1', 5, 'user1')).rejects.toThrow('Joke joke1 not found.');
  });

  it('increments sum and count for a brand-new rating', async () => {
    setJokeDoc('joke1', { averageRating: 4, ratingCount: 2, ratingSum: 8 });
    setRatingDoc('joke1_user1', false);

    await submitUserRating('joke1', 5, 'user1');

    expect(transactionMock.update).toHaveBeenCalledWith(
      { path: 'jokes/joke1' },
      { ratingSum: 13, ratingCount: 3, averageRating: 4.3 }
    );
    expect(transactionMock.set).toHaveBeenCalledWith(
      { path: 'jokeRatings/joke1_user1' },
      expect.objectContaining({ stars: 5, createdAt: 'MOCK_NOW', updatedAt: 'MOCK_NOW' }),
      { merge: true }
    );
  });

  it('swaps the delta and leaves the count unchanged for an updated rating', async () => {
    setJokeDoc('joke1', { averageRating: 4, ratingCount: 2, ratingSum: 8 });
    setRatingDoc('joke1_user1', true, { stars: 3 });

    await submitUserRating('joke1', 5, 'user1');

    // sum: 8 - 3 (old) + 5 (new) = 10, count unchanged at 2, average = 5.0
    expect(transactionMock.update).toHaveBeenCalledWith(
      { path: 'jokes/joke1' },
      { ratingSum: 10, ratingCount: 2, averageRating: 5 }
    );
    // Existing rating docs must not get a fresh createdAt.
    const [, ratingPayload] = transactionMock.set.mock.calls[0];
    expect(ratingPayload).not.toHaveProperty('createdAt');
    expect(ratingPayload).toMatchObject({ stars: 5, updatedAt: 'MOCK_NOW' });
  });

  it('derives ratingSum from averageRating * ratingCount for legacy jokes', async () => {
    // Legacy joke docs predate the ratingSum field.
    setJokeDoc('joke1', { averageRating: 3.5, ratingCount: 2 });
    setRatingDoc('joke1_user1', false);

    await submitUserRating('joke1', 5, 'user1');

    // derived currentSum = round(3.5 * 2) = 7; newSum = 7 + 5 = 12; count = 3
    expect(transactionMock.update).toHaveBeenCalledWith(
      { path: 'jokes/joke1' },
      { ratingSum: 12, ratingCount: 3, averageRating: 4 }
    );
  });

  it('treats a joke with no prior ratings (count 0) as a fresh start', async () => {
    setJokeDoc('joke1', {});
    setRatingDoc('joke1_user1', false);

    await submitUserRating('joke1', 4, 'user1');

    expect(transactionMock.update).toHaveBeenCalledWith(
      { path: 'jokes/joke1' },
      { ratingSum: 4, ratingCount: 1, averageRating: 4 }
    );
  });

  it('trims a non-empty comment', async () => {
    setJokeDoc('joke1', { averageRating: 0, ratingCount: 0, ratingSum: 0 });
    setRatingDoc('joke1_user1', false);

    await submitUserRating('joke1', 5, 'user1', '  nice one!  ');

    const [, ratingPayload] = transactionMock.set.mock.calls[0];
    expect(ratingPayload).toMatchObject({ comment: 'nice one!' });
  });

  it('stores null for a blank comment', async () => {
    setJokeDoc('joke1', { averageRating: 0, ratingCount: 0, ratingSum: 0 });
    setRatingDoc('joke1_user1', false);

    await submitUserRating('joke1', 5, 'user1', '   ');

    const [, ratingPayload] = transactionMock.set.mock.calls[0];
    expect(ratingPayload).toMatchObject({ comment: null });
  });
});
