import { describe, it, expect } from 'vitest';

import { describeEmptyFeed, type FeedEmptyInput } from '@/lib/feedEmptyState';

function input(overrides: Partial<FeedEmptyInput> = {}): FeedEmptyInput {
  return { search: '', hasMoreJokes: false, hasActiveFilters: false, ...overrides };
}

describe('describeEmptyFeed', () => {
  it('says the page, not the search, came up empty while more pages remain', () => {
    const copy = describeEmptyFeed(input({ search: 'penguin', hasMoreJokes: true, hasActiveFilters: true }));

    expect(copy.title).toBe('No jokes on this page matched “penguin”.');
    expect(copy.hint).toContain('load more');
    // No CTA: "Load More" is still enabled below, so clearing the filters
    // would abandon a search that may yet match.
    expect(copy.offerClearFilters).toBe(false);
  });

  it('names the exhausted search term and offers a way out', () => {
    const copy = describeEmptyFeed(input({ search: 'penguin', hasMoreJokes: false, hasActiveFilters: true }));

    expect(copy.title).toBe('No jokes matched “penguin”.');
    expect(copy.hint).toContain('three or more letters');
    expect(copy.offerClearFilters).toBe(true);
  });

  it('keeps a quote character in the search term unmangled', () => {
    const copy = describeEmptyFeed(input({ search: 'the "best" pun', hasActiveFilters: true }));

    expect(copy.title).toBe('No jokes matched “the "best" pun”.');
  });

  it('blames the filters only when filters are what is set', () => {
    const copy = describeEmptyFeed(input({ hasActiveFilters: true }));

    expect(copy.title).toBe('No jokes match these filters.');
    expect(copy.hint).toBe('Loosen one of them, or clear them all and start over.');
    expect(copy.offerClearFilters).toBe(true);
  });

  it('offers to clear filters even when more pages remain, if there is no search', () => {
    const copy = describeEmptyFeed(input({ hasMoreJokes: true, hasActiveFilters: true }));

    expect(copy.title).toBe('No jokes match these filters.');
    expect(copy.offerClearFilters).toBe(true);
  });

  it('never names filters when nothing is filtered', () => {
    const copy = describeEmptyFeed(input());

    expect(copy.title).toBe('No jokes here yet.');
    expect(copy.hint).toBe('Add the first one and it shows up right away.');
    expect(copy.offerClearFilters).toBe(false);
  });

  it('never offers to clear filters when nothing is filtered', () => {
    for (const hasMoreJokes of [true, false]) {
      expect(describeEmptyFeed(input({ hasMoreJokes })).offerClearFilters).toBe(false);
    }
  });

  it('always returns a title and a hint that end in a full stop', () => {
    const cases: Partial<FeedEmptyInput>[] = [
      {},
      { hasActiveFilters: true },
      { search: 'x', hasMoreJokes: true },
      { search: 'x', hasMoreJokes: false },
    ];

    for (const override of cases) {
      const copy = describeEmptyFeed(input(override));
      expect(copy.title.endsWith('.')).toBe(true);
      expect(copy.hint.endsWith('.')).toBe(true);
    }
  });
});
