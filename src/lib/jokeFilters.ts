import type { FilterParams } from '@/services/jokeService';

/**
 * The single canonical filter state for the joke feed.
 *
 * Defaults are also the serializer's "absent" marker: a field equal to its
 * default never appears in the query string, so `/jokes` and
 * `/jokes?scope=public&usageStatus=all` are the same URL.
 */
export const DEFAULT_FILTERS: FilterParams = {
  scope: 'public',
  selectedCategories: [],
  filterFunnyRate: -1,
  usageStatus: 'all',
  search: '',
};

const USAGE_STATUSES: ReadonlyArray<FilterParams['usageStatus']> = ['all', 'used', 'unused'];

/** Read surface shared by `URLSearchParams` and Next's `ReadonlyURLSearchParams`. */
interface ReadableSearchParams {
  get(name: string): string | null;
  getAll(name: string): string[];
}

/**
 * Builds a filter set from a query string. Unknown or malformed values fall
 * back to their default, so a hand-edited URL can never produce an invalid
 * query. Note this does *not* resolve `scope: 'user'` against the signed-in
 * user — that is auth state, not URL state (see `useJokeFilters`).
 */
export function parseFiltersFromParams(params: ReadableSearchParams): FilterParams {
  // One repeated `categories` param per category, not one comma-joined value.
  // The old form could not represent a category whose own name contains a
  // comma — `Dad, jokes` parsed back as two names, both unknown, and the filter
  // was silently dropped. Trimmed and de-duplicated here so a hand-edited URL
  // cannot produce a chip row with the same category twice.
  //
  // Accepted casualty, stated: a bookmarked URL in the old comma form now
  // resolves to a single category literally named `A,B`, which matches nothing.
  // Multi-category links were the only ones affected, and a link carrying a
  // comma-containing name was already broken — that is the bug being fixed.
  const rawCategories = params.getAll('categories');
  const selectedCategories: string[] = [];
  for (const raw of rawCategories) {
    const category = raw.trim();
    if (category !== '' && !selectedCategories.includes(category)) {
      selectedCategories.push(category);
    }
  }

  const rawFunnyRate = params.get('funnyRate');
  let filterFunnyRate = DEFAULT_FILTERS.filterFunnyRate;
  if (rawFunnyRate !== null) {
    const parsedRate = Number.parseInt(rawFunnyRate, 10);
    if (!Number.isNaN(parsedRate) && parsedRate >= -1 && parsedRate <= 5) {
      filterFunnyRate = parsedRate;
    }
  }

  const rawUsageStatus = params.get('usageStatus') as FilterParams['usageStatus'] | null;

  return {
    scope: params.get('scope') === 'user' ? 'user' : DEFAULT_FILTERS.scope,
    selectedCategories,
    filterFunnyRate,
    usageStatus:
      rawUsageStatus !== null && USAGE_STATUSES.includes(rawUsageStatus)
        ? rawUsageStatus
        : DEFAULT_FILTERS.usageStatus,
    search: params.get('search') ?? DEFAULT_FILTERS.search,
  };
}

/**
 * Serializes a filter set, omitting anything left at its default. The inverse
 * of `parseFiltersFromParams` for every value the parser accepts.
 */
export function filtersToSearchParams(filters: FilterParams): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.scope !== DEFAULT_FILTERS.scope) {
    params.set('scope', filters.scope);
  }
  if (filters.selectedCategories.length > 0) {
    // One param per category — see `parseFiltersFromParams`. `append`, not
    // `set`: `set` replaces the previous value of the same key.
    for (const category of filters.selectedCategories) {
      params.append('categories', category);
    }
  }
  if (filters.filterFunnyRate !== DEFAULT_FILTERS.filterFunnyRate) {
    params.set('funnyRate', filters.filterFunnyRate.toString());
  }
  if (filters.usageStatus !== DEFAULT_FILTERS.usageStatus) {
    params.set('usageStatus', filters.usageStatus);
  }
  if (filters.search) {
    params.set('search', filters.search);
  }

  return params;
}

/**
 * Field-by-field equality. Deliberately not `JSON.stringify` comparison: that
 * is key-order dependent, so two filter sets built by different code paths
 * could compare unequal and trigger a redundant fetch.
 */
export function filtersEqual(a: FilterParams, b: FilterParams): boolean {
  return (
    a.scope === b.scope &&
    a.filterFunnyRate === b.filterFunnyRate &&
    a.usageStatus === b.usageStatus &&
    a.search === b.search &&
    a.limit === b.limit &&
    a.selectedCategories.length === b.selectedCategories.length &&
    a.selectedCategories.every((category, index) => category === b.selectedCategories[index])
  );
}

/** True when anything is filtered — i.e. when the URL would carry a query string. */
export function hasActiveFilters(filters: FilterParams): boolean {
  return filtersToSearchParams(filters).toString() !== '';
}

/** Human-readable label for the `filterFunnyRate` value, for badges and selects. */
export function getFunnyRateLabel(rate: number): string {
  if (rate === -1) return 'Any Rating';
  if (rate === 0) return 'Unrated';
  return `${rate} Star${rate > 1 ? 's' : ''}`;
}

/** One removable active filter, as rendered in the `/jokes` badge row. */
export interface FilterChip {
  /** Stable identity for React keys and for tests. */
  key: string;
  /** What the chip reads, e.g. `Category: Puns`. */
  label: string;
  /** The filter set that results from removing this one filter. */
  next: FilterParams;
}

/**
 * The active filters, one chip each, with the filter set that results from
 * dropping it. The page renders these instead of the six hand-written badges
 * it used to, so removing a single filter is one click rather than reopening
 * the dialog and hunting for it in a popover.
 *
 * The order is the order they are applied in the dialog, so the row reads the
 * same way twice running. `limit` and every untouched field ride along through
 * the spread — a chip removes exactly one thing.
 */
export function activeFilterChips(filters: FilterParams): FilterChip[] {
  const chips: FilterChip[] = [];

  if (filters.search) {
    chips.push({
      key: 'search',
      label: `Search: “${filters.search}”`,
      next: { ...filters, search: DEFAULT_FILTERS.search },
    });
  }

  // Reachable only when signed in: `useJokeFilters` downgrades `user` scope to
  // `public` for a signed-out visitor before the page ever sees it.
  if (filters.scope !== DEFAULT_FILTERS.scope) {
    chips.push({
      key: 'scope',
      label: 'Showing: My Jokes',
      next: { ...filters, scope: DEFAULT_FILTERS.scope },
    });
  }

  for (const category of filters.selectedCategories) {
    chips.push({
      key: `category:${category}`,
      label: `Category: ${category}`,
      next: {
        ...filters,
        selectedCategories: filters.selectedCategories.filter((name) => name !== category),
      },
    });
  }

  if (filters.filterFunnyRate !== DEFAULT_FILTERS.filterFunnyRate) {
    chips.push({
      key: 'funnyRate',
      // "Own rating", not "Rating": this filters the author's own score, and
      // the number on every card is the community average.
      label: `Own rating: ${getFunnyRateLabel(filters.filterFunnyRate)}`,
      next: { ...filters, filterFunnyRate: DEFAULT_FILTERS.filterFunnyRate },
    });
  }

  if (filters.usageStatus !== DEFAULT_FILTERS.usageStatus) {
    chips.push({
      key: 'usageStatus',
      label: filters.usageStatus === 'used' ? 'Status: Used' : 'Status: Unused',
      next: { ...filters, usageStatus: DEFAULT_FILTERS.usageStatus },
    });
  }

  return chips;
}

/**
 * Where focus goes when the chip `removedKey` is removed from `chips`: the chip
 * that will occupy its position, or the one before it if it was last, or `null`
 * for "nothing in this row survives — the caller's fallback control".
 *
 * `chips` is the list *before* the removal, so the caller can compute this in
 * the click handler, before the navigation that unmounts the button.
 */
export function nextChipFocusKey(chips: FilterChip[], removedKey: string): string | null {
  const index = chips.findIndex((chip) => chip.key === removedKey);
  if (index === -1) return null;
  return chips[index + 1]?.key ?? chips[index - 1]?.key ?? null;
}
