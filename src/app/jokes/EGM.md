# jokes

## Overview
The `/jokes` route: the main joke feed, either public or the user's own collection. Its filters come from the URL through `useJokeFilters()`. It has a search field, a scope toggle, a filter dialog, removable filter chips, and pagination with "Load More". Sources: `page.tsx` (client component) and `layout.tsx` (sets the metadata title `'Browse jokes'`).

## Interface
- `default JokesPage` in `page.tsx`. It wraps `JokesPageComponent` in `Suspense`.
- Module-private:
  - `JokesPageComponent`: the feed.
  - `JokeGridSkeleton`: renders `SKELETON_CARD_COUNT = 8` placeholder cards.
- `default JokesLayout` in `layout.tsx`. It sets `metadata.title = 'Browse jokes'` and renders its children unchanged.
- Hooks and modules used:
  - `useJokes()`: `jokes`, `loadedFilters`, `jokesError`, `loadJokesWithFilters`, `loadMoreFilteredJokes`, `hasMoreJokes`, `loadingInitialJokes`, `loadingMoreJokes`.
  - `useJokeFilters()`: `filters`, `applyFilters`, `clearFilters`.
  - `@/lib/jokeFilters`: `activeFilterChips`, `filtersEqual`, `filtersToSearchParams`, `hasActiveFilters`, `nextChipFocusKey`.
  - `@/lib/feedAnnounce` and `@/lib/feedEmptyState`.
  - `@/lib/feedReturn`: `FEED_PATH`, `rememberFeedUrl`.
- Child components: `JokeFilterDialog`, `JokeList`.

## Invariants
- The page owns its own fetch. It waits for auth to load, then calls `loadJokesWithFilters(filters)` only when `filters` differs by value (`filtersEqual`) from the last fetched filters (`fetchedFiltersRef`).
- The URL is the source of truth for filters. Search, scope, chip removal and Clear All all go through `applyFilters` or `clearFilters`.
- The search `Input` is uncontrolled and keyed on `filters.search`.
- The feed URL is saved with `rememberFeedUrl(window.sessionStorage, ...)`, built from `filtersToSearchParams(filters)` rather than from `location`.
- Results show skeletons while `loadingInitialJokes` is true, `loadedFilters === null`, or `!filtersEqual(loadedFilters, filters)`. The page header and filter bar stay mounted. The full-page spinner appears only while auth is loading.
- The scope toggle (`All jokes` / `My jokes`) is shown only to signed-in users.
- When a chip is removed, focus moves to the next chip's remove button (`nextChipFocusKey`). After Clear All, it moves to the Filters trigger.
- A single permanently mounted `role="status"` region announces feed status through `describeFeedStatus`. The snapshot ref is not advanced while results reload.
- The result tally and "Load More" are hidden while results reload.

## Side Effects
- Firestore reads through `loadJokesWithFilters` and `loadMoreFilteredJokes`, both outside this subtree.
- Writes the feed URL to `sessionStorage` through `rememberFeedUrl`.
- URL navigation through `applyFilters` and `clearFilters`.

## Verification
- No colocated test file in this directory. Run the full suite: `npm test`
