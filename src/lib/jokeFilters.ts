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
}

/**
 * Builds a filter set from a query string. Unknown or malformed values fall
 * back to their default, so a hand-edited URL can never produce an invalid
 * query. Note this does *not* resolve `scope: 'user'` against the signed-in
 * user — that is auth state, not URL state (see `useJokeFilters`).
 */
export function parseFiltersFromParams(params: ReadableSearchParams): FilterParams {
  // Known limitation (accepted, see context/PROJECT_PROGRESS.md): categories
  // round-trip through a single comma-separated param, so a category name that
  // itself contains a comma parses back as two names and is then dropped as
  // unknown. Fixing it means repeated `categories` params on both sides.
  const rawCategories = params.get('categories');
  const selectedCategories = rawCategories
    ? rawCategories
        .split(',')
        .map((category) => category.trim())
        .filter((category) => category !== '')
    : [...DEFAULT_FILTERS.selectedCategories];

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
    // See the comma limitation noted on `parseFiltersFromParams`.
    params.set('categories', filters.selectedCategories.join(','));
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
