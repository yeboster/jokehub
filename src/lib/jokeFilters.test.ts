import { describe, it, expect } from 'vitest';

import type { FilterParams } from '@/services/jokeService';
import {
  DEFAULT_FILTERS,
  filtersEqual,
  filtersToSearchParams,
  getFunnyRateLabel,
  hasActiveFilters,
  parseFiltersFromParams,
} from '@/lib/jokeFilters';

function filters(overrides: Partial<FilterParams> = {}): FilterParams {
  return { ...DEFAULT_FILTERS, selectedCategories: [], ...overrides };
}

describe('parseFiltersFromParams', () => {
  function parse(query: string) {
    return parseFiltersFromParams(new URLSearchParams(query));
  }

  it('returns the defaults for an empty query string', () => {
    expect(parse('')).toEqual(DEFAULT_FILTERS);
  });

  it('does not hand back the shared default array', () => {
    const parsed = parse('');
    parsed.selectedCategories.push('mutated');
    expect(DEFAULT_FILTERS.selectedCategories).toEqual([]);
  });

  it('reads every field from a fully populated query string', () => {
    expect(parse('scope=user&categories=Puns,Dad%20Jokes&funnyRate=4&usageStatus=used&search=spaghetti')).toEqual({
      scope: 'user',
      selectedCategories: ['Puns', 'Dad Jokes'],
      filterFunnyRate: 4,
      usageStatus: 'used',
      search: 'spaghetti',
    });
  });

  it('splits categories on commas and drops blank entries', () => {
    expect(parse('categories=Puns,,%20Wordplay%20,').selectedCategories).toEqual(['Puns', 'Wordplay']);
  });

  it('falls back to no categories when the parameter is empty', () => {
    expect(parse('categories=').selectedCategories).toEqual([]);
  });

  it('falls back to the public scope for anything but scope=user', () => {
    expect(parse('scope=user').scope).toBe('user');
    expect(parse('scope=public').scope).toBe('public');
    expect(parse('scope=nonsense').scope).toBe('public');
  });

  it('accepts every in-range funny rate, including the 0 "unrated" bucket', () => {
    for (const rate of [-1, 0, 1, 2, 3, 4, 5]) {
      expect(parse(`funnyRate=${rate}`).filterFunnyRate).toBe(rate);
    }
  });

  it('rejects an out-of-range or non-numeric funny rate', () => {
    for (const raw of ['6', '-2', 'abc', '']) {
      expect(parse(`funnyRate=${raw}`).filterFunnyRate).toBe(DEFAULT_FILTERS.filterFunnyRate);
    }
  });

  it('rejects an unknown usage status', () => {
    expect(parse('usageStatus=unused').usageStatus).toBe('unused');
    expect(parse('usageStatus=maybe').usageStatus).toBe('all');
  });

  it('keeps the search term verbatim', () => {
    expect(parse('search=fake%20spaghetti').search).toBe('fake spaghetti');
  });
});

describe('filtersToSearchParams', () => {
  it('omits every field left at its default', () => {
    expect(filtersToSearchParams(filters()).toString()).toBe('');
  });

  it('serializes each non-default field', () => {
    const params = filtersToSearchParams(
      filters({
        scope: 'user',
        selectedCategories: ['Puns', 'Dad Jokes'],
        filterFunnyRate: 3,
        usageStatus: 'unused',
        search: 'cheese',
      })
    );
    expect(params.get('scope')).toBe('user');
    expect(params.get('categories')).toBe('Puns,Dad Jokes');
    expect(params.get('funnyRate')).toBe('3');
    expect(params.get('usageStatus')).toBe('unused');
    expect(params.get('search')).toBe('cheese');
  });

  it('serializes the 0 ("Unrated") funny rate rather than treating it as absent', () => {
    expect(filtersToSearchParams(filters({ filterFunnyRate: 0 })).get('funnyRate')).toBe('0');
  });

  it('round-trips through parseFiltersFromParams', () => {
    const original = filters({
      scope: 'user',
      selectedCategories: ['Puns', 'Wordplay'],
      filterFunnyRate: 0,
      usageStatus: 'used',
      search: 'spaghetti',
    });
    expect(parseFiltersFromParams(filtersToSearchParams(original))).toEqual(original);
  });

  it('round-trips the defaults', () => {
    expect(parseFiltersFromParams(filtersToSearchParams(filters()))).toEqual(DEFAULT_FILTERS);
  });
});

describe('filtersEqual', () => {
  it('is true for two independently built default sets', () => {
    expect(filtersEqual(filters(), filters())).toBe(true);
  });

  it('ignores key insertion order (the reason this is not a JSON.stringify compare)', () => {
    const a: FilterParams = {
      scope: 'user',
      selectedCategories: ['Puns'],
      filterFunnyRate: 4,
      usageStatus: 'used',
      search: 'x',
    };
    const b: FilterParams = {
      search: 'x',
      usageStatus: 'used',
      filterFunnyRate: 4,
      selectedCategories: ['Puns'],
      scope: 'user',
    };
    expect(filtersEqual(a, b)).toBe(true);
  });

  it.each([
    ['scope', { scope: 'user' } as Partial<FilterParams>],
    ['filterFunnyRate', { filterFunnyRate: 5 }],
    ['usageStatus', { usageStatus: 'used' } as Partial<FilterParams>],
    ['search', { search: 'cheese' }],
    ['selectedCategories', { selectedCategories: ['Puns'] }],
  ])('is false when %s differs', (_field, override) => {
    expect(filtersEqual(filters(), filters(override))).toBe(false);
  });

  // The Task 8 nav-staleness guard compares the filters a page mounted with
  // against the ones already loaded; `limit` is part of that identity because
  // the home page fetches a short page and /jokes a full one. Dropping it from
  // this comparison silently reopens the stale-paint hole.
  it('is false when only the page limit differs', () => {
    expect(filtersEqual(filters({ limit: 3 }), filters({ limit: 10 }))).toBe(false);
  });

  it('treats an absent limit as distinct from an explicit one', () => {
    expect(filtersEqual(filters(), filters({ limit: 10 }))).toBe(false);
    expect(filtersEqual(filters({ limit: 10 }), filters({ limit: 10 }))).toBe(true);
  });

  it('is false when categories match by count but not by order', () => {
    expect(
      filtersEqual(filters({ selectedCategories: ['a', 'b'] }), filters({ selectedCategories: ['b', 'a'] }))
    ).toBe(false);
  });

  it('is false when one category list is a prefix of the other', () => {
    expect(
      filtersEqual(filters({ selectedCategories: ['a'] }), filters({ selectedCategories: ['a', 'b'] }))
    ).toBe(false);
  });
});

describe('hasActiveFilters', () => {
  it('is false for the defaults', () => {
    expect(hasActiveFilters(filters())).toBe(false);
  });

  it.each([
    ['scope', { scope: 'user' } as Partial<FilterParams>],
    ['categories', { selectedCategories: ['Puns'] }],
    ['funny rate', { filterFunnyRate: 0 }],
    ['usage status', { usageStatus: 'unused' } as Partial<FilterParams>],
    ['search', { search: 'x' }],
  ])('is true when %s is set', (_label, override) => {
    expect(hasActiveFilters(filters(override))).toBe(true);
  });

  it('ignores the page limit, which is not URL state', () => {
    expect(hasActiveFilters(filters({ limit: 3 }))).toBe(false);
  });
});

describe('getFunnyRateLabel', () => {
  it('labels the sentinel values', () => {
    expect(getFunnyRateLabel(-1)).toBe('Any Rating');
    expect(getFunnyRateLabel(0)).toBe('Unrated');
  });

  it('singularizes one star and pluralizes the rest', () => {
    expect(getFunnyRateLabel(1)).toBe('1 Star');
    expect(getFunnyRateLabel(2)).toBe('2 Stars');
    expect(getFunnyRateLabel(5)).toBe('5 Stars');
  });
});
