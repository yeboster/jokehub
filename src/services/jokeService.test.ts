import { describe, it, expect, vi } from 'vitest';

import type { FilterParams } from '@/services/jokeService';

// The query builder is pure apart from the Firestore constraint factories, so
// the mocks below just record what it asked for: each factory returns a plain
// descriptor and `query()` collects them in order.
vi.mock('@/lib/firebase', () => ({ db: {} }));

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
  Timestamp: { now: vi.fn(() => 'MOCK_NOW') },
}));

import { buildJokesQuery } from '@/services/jokeService';

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

  it('adds no funny-rate constraint for the -1 "any" sentinel', () => {
    expect(whereClauses(constraintsOf({ filterFunnyRate: -1 }))).toEqual([]);
  });

  it('filters on funnyRate for a concrete rate, including 0', () => {
    expect(whereClauses(constraintsOf({ filterFunnyRate: 0 }))).toEqual([
      { field: 'funnyRate', op: '==', value: 0 },
    ]);
    expect(whereClauses(constraintsOf({ filterFunnyRate: 4 }))).toEqual([
      { field: 'funnyRate', op: '==', value: 4 },
    ]);
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
      { field: 'funnyRate', op: '==', value: 5 },
      { field: 'used', op: '==', value: false },
    ]);
    expect(constraints.at(-1)).toEqual({ type: 'limit', count: 7 });
  });
});
