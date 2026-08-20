import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { FilterParams } from '@/services/jokeService';

// The query builder is pure apart from the Firestore constraint factories, so
// the mocks below just record what it asked for: each factory returns a plain
// descriptor and `query()` collects them in order.
vi.mock('@/lib/firebase', () => ({ db: {} }));

const { MockTimestamp } = vi.hoisted(() => {
  class MockTimestamp {
    constructor(private readonly value: Date) {}
    static now = vi.fn(() => 'MOCK_NOW');
    toDate() {
      return this.value;
    }
    toMillis() {
      return this.value.getTime();
    }
  }
  return { MockTimestamp };
});

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, name: string) => ({ type: 'collection', name })),
  query: vi.fn((collectionRef: unknown, ...constraints: unknown[]) => ({ collectionRef, constraints })),
  where: vi.fn((field: string, op: string, value: unknown) => ({ type: 'where', field, op, value })),
  orderBy: vi.fn((field: string, direction: string) => ({ type: 'orderBy', field, direction })),
  limit: vi.fn((count: number) => ({ type: 'limit', count })),
  startAfter: vi.fn((cursor: unknown) => ({ type: 'startAfter', cursor })),
  addDoc: vi.fn(),
  doc: vi.fn(),
  updateDoc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  writeBatch: vi.fn(),
  // A real class, not a bare object: `firestoreTimestamps` narrows with
  // `instanceof`, which throws outright when the right-hand side is not
  // callable — so every joke that carries a date has to come back through one
  // of these.
  Timestamp: MockTimestamp,
}));

import { buildJokesQuery, fetchJokes } from '@/services/jokeService';
import { getDocs, query as queryFactory } from 'firebase/firestore';

/** The default page size baked into `jokeService`. */
const PAGE_SIZE = 12;

interface Constraint {
  type: string;
  field?: string;
  op?: string;
  value?: unknown;
  direction?: string;
  count?: number;
  cursor?: unknown;
}

const DEFAULTS: FilterParams = {
  scope: 'public',
  selectedCategories: [],
  filterFunnyRate: -1,
  usageStatus: 'all',
  search: '',
};

type BuildArgs = Parameters<typeof buildJokesQuery>;

/** Runs the builder against the mocks above and exposes what it recorded. */
function build(
  overrides: Partial<FilterParams> = {},
  userId?: BuildArgs[1],
  cursor?: BuildArgs[2],
  options?: BuildArgs[3]
) {
  return buildJokesQuery({ ...DEFAULTS, ...overrides }, userId, cursor, options) as {
    collectionRef: { name: string };
    constraints: Constraint[];
  } | null;
}

function constraintsOf(
  overrides: Partial<FilterParams> = {},
  userId?: BuildArgs[1],
  cursor?: BuildArgs[2],
  options?: BuildArgs[3]
): Constraint[] {
  const result = build(overrides, userId, cursor, options);
  if (!result) throw new Error('expected a query, got null');
  return result.constraints;
}

function whereClauses(constraints: Constraint[]) {
  return constraints
    .filter((constraint) => constraint.type === 'where')
    .map(({ field, op, value }) => ({ field, op, value }));
}

/** The orderings a query asked for, in the order it asked for them. */
function orderings(constraints: Constraint[]) {
  return constraints
    .filter((constraint) => constraint.type === 'orderBy')
    .map(({ field, direction }) => ({ field, direction }));
}

describe('buildJokesQuery', () => {
  it('targets the jokes collection', () => {
    expect(build()?.collectionRef.name).toBe('jokes');
  });

  it('builds the minimal public query: order by date, page limit, no filters', () => {
    expect(constraintsOf()).toEqual([
      { type: 'orderBy', field: 'dateAdded', direction: 'desc' },
      { type: 'limit', count: PAGE_SIZE },
    ]);
  });

  it('returns null for a user-scoped query with no signed-in user', () => {
    expect(build({ scope: 'user' })).toBeNull();
  });

  it('constrains on userId when the scope is user and a uid is supplied', () => {
    expect(whereClauses(constraintsOf({ scope: 'user' }, 'uid-1'))).toContainEqual({
      field: 'userId',
      op: '==',
      value: 'uid-1',
    });
  });

  it('ignores the uid for a public-scoped query', () => {
    expect(whereClauses(constraintsOf({}, 'uid-1'))).toEqual([]);
  });

  it('constrains on the first search token only — the rest are intersected client-side', () => {
    expect(whereClauses(constraintsOf({ search: 'Fake Spaghetti' }))).toEqual([
      { field: 'keywords', op: 'array-contains', value: 'fake' },
    ]);
  });

  it('adds no search constraint when every word is too short or is punctuation', () => {
    expect(whereClauses(constraintsOf({ search: 'an ?! a' }))).toEqual([]);
  });

  it('strips punctuation from the search token so "atoms?" matches the stored keyword', () => {
    expect(whereClauses(constraintsOf({ search: 'atoms?' }))).toEqual([
      { field: 'keywords', op: 'array-contains', value: 'atoms' },
    ]);
  });

  it('filters on the selected categories with an "in" clause', () => {
    expect(whereClauses(constraintsOf({ selectedCategories: ['Puns', 'Dad Jokes'] }))).toEqual([
      { field: 'category', op: 'in', value: ['Puns', 'Dad Jokes'] },
    ]);
  });

  it('caps the category "in" clause at 30 values (Firestore\'s disjunction limit)', () => {
    const many = Array.from({ length: 45 }, (_unused, index) => `cat-${index}`);
    const [categoryClause] = whereClauses(constraintsOf({ selectedCategories: many }));
    expect((categoryClause.value as string[]).length).toBe(30);
    expect(categoryClause.value).toEqual(many.slice(0, 30));
  });

  it('adds no rating constraint for the -1 "any" sentinel', () => {
    expect(whereClauses(constraintsOf({ filterFunnyRate: -1 }))).toEqual([]);
  });

  it('filters the unrated bucket on the rating count, not on an average', () => {
    expect(whereClauses(constraintsOf({ filterFunnyRate: 0 }))).toEqual([
      { field: 'ratingCount', op: '==', value: 0 },
    ]);
  });

  it('filters a rating band as a floor under the community average', () => {
    expect(whereClauses(constraintsOf({ filterFunnyRate: 4 }))).toEqual([
      { field: 'averageRating', op: '>=', value: 4 },
    ]);
    expect(whereClauses(constraintsOf({ filterFunnyRate: 2 }))).toEqual([
      { field: 'averageRating', op: '>=', value: 2 },
    ]);
  });

  // "3 stars and up" is one clause, not two: nothing is excluded from above,
  // so a joke averaging 5 answers every choice from 1 to 5.
  it('never puts a ceiling on a band', () => {
    for (const filterFunnyRate of [1, 2, 3, 4, 5]) {
      const clauses = whereClauses(constraintsOf({ filterFunnyRate }));
      expect(clauses).toHaveLength(1);
      expect(clauses[0].op).toBe('>=');
    }
  });

  // Marco's case: a joke the community rates 5 averages 4.8 or 4.9 as often as
  // it averages exactly 5, and the old equality clause on the author's own
  // score matched none of them.
  it('floors the 5-star band at 4.5, so a 4.8 average is in it', () => {
    expect(whereClauses(constraintsOf({ filterFunnyRate: 5 }))).toEqual([
      { field: 'averageRating', op: '>=', value: 4.5 },
    ]);
  });

  // Marco's second report: with a band active Firestore orders by the banded
  // field first, and its unasked-for direction is ascending — so his freshly
  // rated 5.0 sat behind every 4.5 in the collection. Descending puts the top
  // of the band on the first page.
  it('orders a band by the average, descending, ahead of the date ordering', () => {
    for (const filterFunnyRate of [1, 2, 3, 4, 5]) {
      expect(orderings(constraintsOf({ filterFunnyRate }))).toEqual([
        { field: 'averageRating', direction: 'desc' },
        { field: 'dateAdded', direction: 'desc' },
      ]);
    }
  });

  it('orders by date alone when no band is active', () => {
    expect(orderings(constraintsOf())).toEqual([{ field: 'dateAdded', direction: 'desc' }]);
  });

  it('leaves the unrated bucket ordered by date alone — a count clause is not a range', () => {
    expect(orderings(constraintsOf({ filterFunnyRate: 0 }))).toEqual([
      { field: 'dateAdded', direction: 'desc' },
    ]);
  });

  it('drops the average ordering along with the date one on the no-ordering fallback', () => {
    expect(orderings(constraintsOf({ filterFunnyRate: 5 }, undefined, null, { orderByDateAdded: false }))).toEqual(
      []
    );
  });

  it('never constrains the author-owned funnyRate field', () => {
    for (const filterFunnyRate of [-1, 0, 1, 2, 3, 4, 5]) {
      expect(whereClauses(constraintsOf({ filterFunnyRate })).map((clause) => clause.field)).not.toContain(
        'funnyRate'
      );
    }
  });

  it('maps the usage status to a boolean `used` constraint', () => {
    expect(whereClauses(constraintsOf({ usageStatus: 'used' }))).toEqual([
      { field: 'used', op: '==', value: true },
    ]);
    expect(whereClauses(constraintsOf({ usageStatus: 'unused' }))).toEqual([
      { field: 'used', op: '==', value: false },
    ]);
    expect(whereClauses(constraintsOf({ usageStatus: 'all' }))).toEqual([]);
  });

  it('honours an explicit page limit and falls back to the default page size', () => {
    expect(constraintsOf({ limit: 3 })).toContainEqual({ type: 'limit', count: 3 });
    expect(constraintsOf()).toContainEqual({ type: 'limit', count: PAGE_SIZE });
  });

  it('appends the pagination cursor when one is supplied', () => {
    const cursor = { id: 'last-doc' };
    const constraints = constraintsOf({}, undefined, cursor as never);
    expect(constraints).toContainEqual({ type: 'startAfter', cursor });
    // The cursor must come after the ordering it is a cursor into.
    expect(constraints.findIndex((c) => c.type === 'startAfter')).toBeGreaterThan(
      constraints.findIndex((c) => c.type === 'orderBy')
    );
  });

  it('drops the orderBy for the missing-index fallback path', () => {
    const constraints = constraintsOf({}, undefined, null, { orderByDateAdded: false });
    expect(constraints.some((constraint) => constraint.type === 'orderBy')).toBe(false);
    expect(constraints).toContainEqual({ type: 'limit', count: PAGE_SIZE });
  });

  it('combines every filter into one query, with the limit last', () => {
    const constraints = constraintsOf(
      {
        scope: 'user',
        search: 'cheese',
        selectedCategories: ['Puns'],
        filterFunnyRate: 5,
        usageStatus: 'unused',
        limit: 7,
      },
      'uid-1'
    );
    expect(whereClauses(constraints)).toEqual([
      { field: 'userId', op: '==', value: 'uid-1' },
      { field: 'keywords', op: 'array-contains', value: 'cheese' },
      { field: 'category', op: 'in', value: ['Puns'] },
      { field: 'averageRating', op: '>=', value: 4.5 },
      { field: 'used', op: '==', value: false },
    ]);
    expect(orderings(constraints)).toEqual([
      { field: 'averageRating', direction: 'desc' },
      { field: 'dateAdded', direction: 'desc' },
    ]);
    expect(constraints.at(-1)).toEqual({ type: 'limit', count: 7 });
  });
});

describe('fetchJokes — the rating filter without its index', () => {
  const getDocsMock = vi.mocked(getDocs);

  beforeEach(() => {
    vi.clearAllMocks();
    // `warnMissingIndex` logs on every fallback; the test asserts the
    // behaviour, not the console.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  /** A Firestore error as the SDK reports a missing composite index. */
  function missingIndexError() {
    return Object.assign(new Error('The query requires an index.'), { code: 'failed-precondition' });
  }

  /** A snapshot of joke docs, in the shape `fetchJokesPage` reads. */
  function snapshotOf(jokes: Array<{ id: string; averageRating?: number; ratingCount?: number }>) {
    return {
      docs: jokes.map(({ id, ...data }) => ({
        id,
        data: () => ({ ...data, text: id, dateAdded: new MockTimestamp(new Date('2026-08-01')) }),
      })),
    };
  }

  /** The `where` clauses of the nth query the service built. */
  function clausesOfCall(callIndex: number) {
    const built = vi.mocked(queryFactory).mock.results[callIndex].value as {
      constraints: Constraint[];
    };
    return whereClauses(built.constraints);
  }

  it('applies the band on the client and keeps the date ordering', async () => {
    getDocsMock.mockRejectedValueOnce(missingIndexError()).mockResolvedValueOnce(
      snapshotOf([
        { id: 'loved', averageRating: 4.8, ratingCount: 5 },
        { id: 'liked', averageRating: 4.1, ratingCount: 5 },
        { id: 'unrated' },
      ]) as never
    );

    const page = await fetchJokes({ ...DEFAULTS, filterFunnyRate: 5 });

    expect(page.jokes.map((joke) => joke.id)).toEqual(['loved']);
    expect(page.ratingFilterDegraded).toBe(true);
    // The retry gives up the band and nothing else — the ordering stays, and
    // so does the cursor's meaning.
    expect(clausesOfCall(1)).toEqual([]);
    const retry = vi.mocked(queryFactory).mock.results[1].value as { constraints: Constraint[] };
    // Band gone, so the average ordering that belonged to it goes too: this
    // page is plain newest-first, which is the ordering its index exists for.
    expect(orderings(retry.constraints)).toEqual([{ field: 'dateAdded', direction: 'desc' }]);
  });

  it('keeps everything above the floor when the band is applied client-side', async () => {
    getDocsMock.mockRejectedValueOnce(missingIndexError()).mockResolvedValueOnce(
      snapshotOf([
        { id: 'adored', averageRating: 5, ratingCount: 9 },
        { id: 'liked', averageRating: 3.2, ratingCount: 5 },
        { id: 'tolerated', averageRating: 2.9, ratingCount: 5 },
      ]) as never
    );

    const page = await fetchJokes({ ...DEFAULTS, filterFunnyRate: 3 });

    // "3 stars and up" — the 5 stays in, which is the whole point of the
    // cumulative floors; only the 2.9 is below the line.
    expect(page.jokes.map((joke) => joke.id)).toEqual(['adored', 'liked']);
    expect(page.ratingFilterDegraded).toBe(true);
  });

  it('reports the page as short rather than claiming the collection is empty', async () => {
    // Twelve documents came back, so there is more behind them; none is in the
    // band, so this page shows nothing. `hasMore` follows the raw docs.
    const docs = Array.from({ length: 12 }, (_unused, index) => ({
      id: `joke-${index}`,
      averageRating: 2.5,
      ratingCount: 4,
    }));
    // Every query carrying the band fails, page after page, the way a missing
    // index does — `fetchJokes` pages on through the empty results it gets.
    getDocsMock.mockImplementation((async (built: unknown) => {
      const { constraints } = built as { constraints: Constraint[] };
      if (whereClauses(constraints).some((clause) => clause.field === 'averageRating')) {
        throw missingIndexError();
      }
      return snapshotOf(docs);
    }) as unknown as typeof getDocs);

    const page = await fetchJokes({ ...DEFAULTS, filterFunnyRate: 5 });

    expect(page.jokes).toEqual([]);
    expect(page.hasMore).toBe(true);
    expect(page.ratingFilterDegraded).toBe(true);
  });

  it('leaves any other failure to the caller, exactly as before', async () => {
    const permissionDenied = Object.assign(new Error('Missing or insufficient permissions.'), {
      code: 'permission-denied',
    });
    getDocsMock.mockRejectedValueOnce(permissionDenied);

    await expect(fetchJokes({ ...DEFAULTS, filterFunnyRate: 5 })).rejects.toThrow(
      'Missing or insufficient permissions.'
    );
    expect(getDocsMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the unrated constraint on the server and drops the ordering instead', async () => {
    getDocsMock
      .mockRejectedValueOnce(missingIndexError())
      .mockResolvedValueOnce(snapshotOf([{ id: 'nobody-rated-me' }]) as never);

    const page = await fetchJokes({ ...DEFAULTS, filterFunnyRate: 0 });

    expect(page.jokes.map((joke) => joke.id)).toEqual(['nobody-rated-me']);
    expect(page.ratingFilterDegraded).toBe(false);
    expect(clausesOfCall(1)).toEqual([{ field: 'ratingCount', op: '==', value: 0 }]);
    const retry = vi.mocked(queryFactory).mock.results[1].value as { constraints: Constraint[] };
    expect(retry.constraints.some((constraint) => constraint.type === 'orderBy')).toBe(false);
  });

  it('does not degrade an unfiltered feed, and reports it', async () => {
    getDocsMock
      .mockRejectedValueOnce(missingIndexError())
      .mockResolvedValueOnce(snapshotOf([{ id: 'anything' }]) as never);

    const page = await fetchJokes(DEFAULTS);

    expect(page.jokes.map((joke) => joke.id)).toEqual(['anything']);
    expect(page.ratingFilterDegraded).toBe(false);
  });

  it('gives up the ordering too when the band-free retry has no index either', async () => {
    getDocsMock
      .mockRejectedValueOnce(missingIndexError())
      .mockRejectedValueOnce(missingIndexError())
      .mockResolvedValueOnce(snapshotOf([{ id: 'loved', averageRating: 5, ratingCount: 3 }]) as never);

    const page = await fetchJokes({ ...DEFAULTS, filterFunnyRate: 5 });

    expect(page.jokes.map((joke) => joke.id)).toEqual(['loved']);
    expect(page.ratingFilterDegraded).toBe(true);
    expect(getDocsMock).toHaveBeenCalledTimes(3);
  });

  it('reports no degrade on a fetch that never reached Firestore', async () => {
    const page = await fetchJokes({ ...DEFAULTS, search: 'an', filterFunnyRate: 5 });

    expect(page.ratingFilterDegraded).toBe(false);
    expect(getDocsMock).not.toHaveBeenCalled();
  });
});
