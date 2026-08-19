import { describe, it, expect } from 'vitest';

import type { FilterParams } from '@/services/jokeService';
import {
  activeFilterChips,
  DEFAULT_FILTERS,
  filtersEqual,
  filtersToSearchParams,
  getFunnyRateLabel,
  hasActiveFilters,
  nextChipFocusKey,
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
    expect(
      parse('scope=user&categories=Puns&categories=Dad%20Jokes&funnyRate=4&usageStatus=used&search=spaghetti')
    ).toEqual({
      scope: 'user',
      selectedCategories: ['Puns', 'Dad Jokes'],
      filterFunnyRate: 4,
      usageStatus: 'used',
      search: 'spaghetti',
    });
  });

  it('reads one repeated param per category, in the order they appear', () => {
    expect(parse('categories=Puns&categories=Dad').selectedCategories).toEqual(['Puns', 'Dad']);
  });

  it('trims whitespace around a repeated value', () => {
    expect(parse('categories=%20Puns%20&categories=%09Dad%20Jokes').selectedCategories).toEqual([
      'Puns',
      'Dad Jokes',
    ]);
  });

  it('drops an empty repeated value rather than filtering by nothing', () => {
    expect(parse('categories=&categories=Puns').selectedCategories).toEqual(['Puns']);
  });

  it('de-duplicates a hand-edited URL, so the chip row cannot show one category twice', () => {
    expect(parse('categories=Puns&categories=Puns').selectedCategories).toEqual(['Puns']);
  });

  it('falls back to no categories when the parameter is empty', () => {
    expect(parse('categories=').selectedCategories).toEqual([]);
  });

  it('keeps a comma inside a category name, which the old joined form split in two', () => {
    expect(parse('categories=Dad%2C+jokes').selectedCategories).toEqual(['Dad, jokes']);
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
    expect(params.getAll('categories')).toEqual(['Puns', 'Dad Jokes']);
    expect(params.get('funnyRate')).toBe('3');
    expect(params.get('usageStatus')).toBe('unused');
    expect(params.get('search')).toBe('cheese');
  });

  it('emits one categories param per category, and none at all for none', () => {
    expect(filtersToSearchParams(filters({ selectedCategories: ['Puns', 'Dad'] })).toString()).toBe(
      'categories=Puns&categories=Dad'
    );
    expect(filtersToSearchParams(filters({ selectedCategories: [] })).has('categories')).toBe(false);
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

  /** Serialize, go through the query string as a browser would, and parse back. */
  function roundTripCategories(selectedCategories: string[]): string[] {
    const query = filtersToSearchParams(filters({ selectedCategories })).toString();
    return parseFiltersFromParams(new URLSearchParams(query)).selectedCategories;
  }

  it('round-trips a category name containing a comma', () => {
    expect(roundTripCategories(['Dad, jokes'])).toEqual(['Dad, jokes']);
  });

  it('round-trips a category name containing an ampersand', () => {
    expect(roundTripCategories(['Cats & dogs'])).toEqual(['Cats & dogs']);
  });

  it('round-trips category names containing spaces, alongside a comma-bearing one', () => {
    expect(roundTripCategories(['Dad Jokes', 'Dad, jokes'])).toEqual(['Dad Jokes', 'Dad, jokes']);
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

describe('activeFilterChips', () => {
  /** The fields that differ between two filter sets — a chip must change one. */
  function changedFields(before: FilterParams, after: FilterParams): string[] {
    const keys: (keyof FilterParams)[] = [
      'scope',
      'selectedCategories',
      'filterFunnyRate',
      'usageStatus',
      'search',
      'limit',
    ];
    const sameCategories =
      before.selectedCategories.length === after.selectedCategories.length &&
      before.selectedCategories.every((name, index) => name === after.selectedCategories[index]);
    return keys.filter((key) =>
      key === 'selectedCategories'
        ? !sameCategories
        : before[key] !== after[key]
    );
  }

  it('returns no chips for the default filters', () => {
    expect(activeFilterChips(filters())).toEqual([]);
  });

  it('makes one chip for a search term and clears only the search', () => {
    const input = filters({ search: 'penguin' });
    const chips = activeFilterChips(input);

    expect(chips).toHaveLength(1);
    expect(chips[0].key).toBe('search');
    expect(chips[0].label).toBe('Search: “penguin”');
    expect(chips[0].next.search).toBe('');
    expect(changedFields(input, chips[0].next)).toEqual(['search']);
  });

  it('keeps a quote character in the search term intact', () => {
    const chips = activeFilterChips(filters({ search: 'the "best" pun' }));

    expect(chips[0].label).toBe('Search: “the "best" pun”');
  });

  it('makes one chip for the user scope that returns to the public feed', () => {
    const chips = activeFilterChips(filters({ scope: 'user' }));

    expect(chips).toHaveLength(1);
    expect(chips[0].key).toBe('scope');
    expect(chips[0].label).toBe('Showing: My Jokes');
    expect(chips[0].next.scope).toBe('public');
  });

  it('makes one chip per category and drops only the removed one, in order', () => {
    const input = filters({ selectedCategories: ['Puns', 'Dad Jokes', 'Observational'] });
    const chips = activeFilterChips(input);

    expect(chips.map((chip) => chip.key)).toEqual([
      'category:Puns',
      'category:Dad Jokes',
      'category:Observational',
    ]);
    expect(chips[1].label).toBe('Category: Dad Jokes');
    expect(chips[1].next.selectedCategories).toEqual(['Puns', 'Observational']);
    // The input is not mutated: the page keeps rendering the chips it built.
    expect(input.selectedCategories).toEqual(['Puns', 'Dad Jokes', 'Observational']);
  });

  it('labels the rating chip with the shared rate label', () => {
    expect(activeFilterChips(filters({ filterFunnyRate: 0 }))[0].label).toBe('Rating: Unrated');
    expect(activeFilterChips(filters({ filterFunnyRate: 1 }))[0].label).toBe('Rating: 1 Star');
    expect(activeFilterChips(filters({ filterFunnyRate: 3 }))[0].label).toBe('Rating: 3 Stars');
    expect(activeFilterChips(filters({ filterFunnyRate: 3 }))[0].next.filterFunnyRate).toBe(-1);
  });

  it('labels both usage statuses and resets them to "all"', () => {
    const used = activeFilterChips(filters({ usageStatus: 'used' }));
    const unused = activeFilterChips(filters({ usageStatus: 'unused' }));

    expect(used[0].key).toBe('usageStatus');
    expect(used[0].label).toBe('Status: Used');
    expect(used[0].next.usageStatus).toBe('all');
    expect(unused[0].label).toBe('Status: Unused');
    expect(unused[0].next.usageStatus).toBe('all');
  });

  it('orders every active filter the way the dialog applies them', () => {
    const input = filters({
      search: 'cat',
      scope: 'user',
      selectedCategories: ['Puns', 'Wordplay'],
      filterFunnyRate: 5,
      usageStatus: 'unused',
    });

    expect(activeFilterChips(input).map((chip) => chip.key)).toEqual([
      'search',
      'scope',
      'category:Puns',
      'category:Wordplay',
      'funnyRate',
      'usageStatus',
    ]);
  });

  it('changes exactly one field per chip when everything is active', () => {
    const input = filters({
      search: 'cat',
      scope: 'user',
      selectedCategories: ['Puns', 'Wordplay'],
      filterFunnyRate: 5,
      usageStatus: 'unused',
    });

    for (const chip of activeFilterChips(input)) {
      expect(changedFields(input, chip.next)).toHaveLength(1);
    }
  });

  it('carries the page limit through into every chip', () => {
    const input = filters({ limit: 3, search: 'cat', usageStatus: 'used', filterFunnyRate: 2 });

    for (const chip of activeFilterChips(input)) {
      expect(chip.next.limit).toBe(3);
    }
  });

  it('leaves nothing filtered when the only active filter is removed', () => {
    const singles: Partial<FilterParams>[] = [
      { search: 'penguin' },
      { scope: 'user' },
      { selectedCategories: ['Puns'] },
      { filterFunnyRate: 4 },
      { usageStatus: 'used' },
    ];

    for (const override of singles) {
      const chips = activeFilterChips(filters(override));
      expect(chips).toHaveLength(1);
      expect(hasActiveFilters(chips[0].next)).toBe(false);
    }
  });
});

describe('nextChipFocusKey', () => {
  /** Three chips in the order `activeFilterChips` builds them. */
  const threeChips = activeFilterChips(
    filters({ search: 'cat', scope: 'user', usageStatus: 'used' })
  );

  it('hands focus to the chip that takes the removed one’s place', () => {
    expect(threeChips.map((chip) => chip.key)).toEqual(['search', 'scope', 'usageStatus']);
    expect(nextChipFocusKey(threeChips, 'search')).toBe('scope');
  });

  it('hands focus forwards when the middle chip goes', () => {
    expect(nextChipFocusKey(threeChips, 'scope')).toBe('usageStatus');
  });

  it('hands focus backwards when the last chip goes', () => {
    expect(nextChipFocusKey(threeChips, 'usageStatus')).toBe('scope');
  });

  it('returns null for the only chip, so the caller falls back to its own control', () => {
    const single = activeFilterChips(filters({ search: 'penguin' }));
    expect(single).toHaveLength(1);
    expect(nextChipFocusKey(single, 'search')).toBeNull();
  });

  it('returns null for a key that is not in the row', () => {
    expect(nextChipFocusKey(threeChips, 'funnyRate')).toBeNull();
  });

  it('returns null for an empty row', () => {
    expect(nextChipFocusKey([], 'search')).toBeNull();
  });
});
