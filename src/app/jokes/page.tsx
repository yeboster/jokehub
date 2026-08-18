
"use client";

import { Suspense, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { ChevronDown, Loader2, PlusCircle, RotateCcw, Search, X as XIcon } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { useJokes } from '@/contexts/JokeContext';
import { useJokeFilters } from '@/hooks/useJokeFilters';
import type { FilterParams } from '@/services/jokeService';
import { describeEmptyFeed } from '@/lib/feedEmptyState';
import { activeFilterChips, filtersEqual, hasActiveFilters } from '@/lib/jokeFilters';
import Header from '@/components/header';
import JokeFilterDialog from '@/components/jokes/JokeFilterDialog';
import JokeList from '@/components/joke-list';
import PageLoading from '@/components/PageLoading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** How many placeholder cards to show while a page of jokes loads. */
const SKELETON_CARD_COUNT = 8;

/**
 * Placeholder cards laid out in the same grid `JokeList` uses, so the results
 * area keeps its shape while a fetch is in flight instead of collapsing.
 */
function JokeGridSkeleton() {
  return (
    // ARIA has no author-supplied name for a role-less <div> (role=generic), so
    // the announcement rides on role="status" plus visually hidden text.
    <div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 py-6"
      role="status"
      aria-busy="true"
    >
      <span className="sr-only">Loading jokes…</span>
      {Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => (
        // The card chrome here mirrors `JokeListItem` exactly so the swap from
        // skeleton to content does not shift anything. The shimmer lives on
        // the bars (`.skeleton-bar`), not on the card, so the border and the
        // layout stay still while only the placeholders move.
        <div
          key={index}
          className="flex flex-col rounded-lg border border-primary/20 bg-card shadow-sm overflow-hidden"
        >
          <div className="p-5 flex-grow space-y-2">
            <div className="skeleton-bar h-3 w-full" />
            <div className="skeleton-bar h-3 w-11/12" />
            <div className="skeleton-bar h-3 w-3/4" />
            <div className="skeleton-bar h-5 w-20 rounded-md mt-6" />
          </div>
          <div className="p-4 border-t border-border/50 flex items-center justify-between">
            <div className="skeleton-bar h-3 w-24" />
            <div className="skeleton-bar h-3 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

function JokesPageComponent() {
  const { user, loading: authLoading } = useAuth();
  const {
    jokes,
    loadedFilters,
    loadJokesWithFilters,
    loadMoreFilteredJokes,
    hasMoreJokes,
    loadingInitialJokes,
    loadingMoreJokes,
  } = useJokes();
  const { filters, applyFilters, clearFilters } = useJokeFilters();

  // This page owns its fetch — the provider no longer loads jokes on its own.
  // `filters` is derived from the URL, so a deep link arrives with its filters
  // already resolved and this fires exactly once. We still wait for auth,
  // because the scope resolves against `user` and we'd otherwise fetch a scope
  // we're about to change. Categories only feed the filter dialog, so the list
  // never waits on them.
  //
  // The guard compares by value rather than trusting the identity of `filters`
  // or of `loadJokesWithFilters`: a `useMemo` result is a cache hint, not a
  // stability guarantee, so identity alone could refire the effect and throw
  // away a page the user had already loaded more of.
  const fetchedFiltersRef = useRef<FilterParams | null>(null);
  useEffect(() => {
    if (authLoading) return;
    if (fetchedFiltersRef.current && filtersEqual(fetchedFiltersRef.current, filters)) return;
    fetchedFiltersRef.current = filters;
    loadJokesWithFilters(filters);
  }, [authLoading, filters, loadJokesWithFilters]);

  const jokesToDisplay = useMemo(() => jokes ?? [], [jokes]);

  const isMyJokes = filters.scope === 'user' && !!user;
  const pageTitle = isMyJokes ? 'My Joke Collection' : 'All Jokes Feed';
  const pageDescription = isMyJokes
    ? 'Manage and filter your personal joke collection.'
    : 'Browse, filter, and enjoy jokes from the community. Add your own too!';

  // The chrome (header, filter bar, active-filter badges) stays mounted for
  // every fetch — only the results grid swaps to skeletons, so applying a
  // filter no longer blanks the page and loses scroll position. The full-page
  // spinner is reserved for the genuine first paint: while auth resolves we
  // don't yet know the scope, and therefore not even the page title.
  //
  // The `loadedFilters` check covers the commit before the effect above runs:
  // `jokes` lives in the provider (root layout), so a client-side navigation
  // lands here with the home page's three jokes in state and no loading flag
  // set. Skeletons until the held list is the one this page asked for.
  const isReloadingResults =
    loadingInitialJokes || loadedFilters === null || !filtersEqual(loadedFilters, filters);

  if (authLoading) {
    return <PageLoading label="Loading jokes…" />;
  }

  return (
    <div className="container mx-auto px-4 py-8 sm:px-6 md:py-12">
      <Header title={pageTitle} description={pageDescription} centered />

      {/* Wraps on narrow screens: the trigger buttons, the active-filter badges
          and the action cluster each take a full row rather than being crushed
          into one. `p-4` was fighting `pb-6` on the same edge — the bottom
          padding is the one that matters, since it sets the gap to the rule. */}
      <div className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-3 border-b pb-6">
        {/* Search is the primary discovery path for a joke collection, so it
            is a field on the page rather than a control inside a dialog. The
            dialog keeps the filters that are genuinely a form. */}
        <form
          role="search"
          className="flex basis-full items-center gap-2 sm:basis-auto sm:flex-1 sm:max-w-sm"
          onSubmit={(event) => {
            event.preventDefault();
            const entered = new FormData(event.currentTarget).get('search');
            applyFilters({ ...filters, search: typeof entered === 'string' ? entered.trim() : '' });
          }}
        >
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              // Uncontrolled and re-keyed on the applied term. The URL is the
              // source of truth; re-keying re-seeds the box after a chip
              // removal or "Clear All" without an effect that would fight the
              // user mid-keystroke.
              key={filters.search}
              name="search"
              type="search"
              defaultValue={filters.search}
              placeholder="Search by keyword…"
              aria-label="Search jokes by keyword"
              className="h-9 pl-8"
            />
          </div>
          <Button type="submit" variant="secondary" size="sm" className="h-9 shrink-0">
            Search
          </Button>
        </form>

        {/* Scope is the difference between "the app" and "my collection", and
            it was a <Select> inside a dialog. Signed-out visitors get no
            toggle: `useJokeFilters` downgrades `user` scope to `public` for
            them, so the second option would be a button that does nothing. */}
        {user && (
          <div role="group" aria-label="Whose jokes to show" className="flex shrink-0 items-center rounded-md border p-0.5">
            {([
              { scope: 'public' as const, label: 'All jokes' },
              { scope: 'user' as const, label: 'My jokes' },
            ]).map(({ scope, label }) => (
              <Button
                key={scope}
                type="button"
                size="sm"
                variant={filters.scope === scope ? 'default' : 'ghost'}
                aria-pressed={filters.scope === scope}
                className="h-8 px-3"
                onClick={() => {
                  if (filters.scope !== scope) applyFilters({ ...filters, scope });
                }}
              >
                {label}
              </Button>
            ))}
          </div>
        )}

        <JokeFilterDialog value={filters} onApply={applyFilters} />

        {/* `min-h-[36px]` keeps the row from changing height as chips appear
            and disappear, and `basis-full` gives it its own line on a phone —
            but with no filter active the two together painted an empty 36px
            band above the action cluster. `empty:hidden` drops the row out of
            the flex flow entirely in that case, so it also takes no gap. */}
        <ul className="flex flex-wrap items-center gap-2 flex-grow basis-full sm:basis-auto min-h-[36px] empty:hidden list-none p-0 m-0">
          {activeFilterChips(filters).map((chip) => (
            <li key={chip.key}>
              <Badge variant="secondary" className="py-1 pl-2 pr-0.5 gap-1">
                {chip.label}
                <button
                  type="button"
                  aria-label={`Remove filter: ${chip.label}`}
                  // Applying `chip.next` navigates, exactly as the dialog's
                  // Apply does — the URL stays the single source of truth for
                  // the feed, so a removed chip is in the back button too.
                  onClick={() => applyFilters(chip.next)}
                  className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground outline-none ring-offset-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                >
                  <XIcon className="h-3 w-3" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>

        <div className="flex w-full items-center justify-end sm:w-auto sm:ml-auto">
          <Button variant="default" size="sm" className="h-9" asChild>
            <Link href={user ? '/add-joke' : '/auth?redirect=/add-joke'}>
              <PlusCircle className="mr-2 h-4 w-4" />
              {user ? 'Add New Joke' : 'Log in to Add Jokes'}
            </Link>
          </Button>

          {hasActiveFilters(filters) && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="ml-2 h-9">
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Clear All
            </Button>
          )}
        </div>
      </div>

      {isReloadingResults ? (
        <JokeGridSkeleton />
      ) : (
        <JokeList
          jokes={jokesToDisplay}
          emptyCopy={describeEmptyFeed({
            search: filters.search,
            hasMoreJokes,
            hasActiveFilters: hasActiveFilters(filters),
          })}
          onClearFilters={clearFilters}
        />
      )}

      <div className="mt-8 text-center">
        {/* Hidden while the list reloads: "load more" pages from the *new*
            filters and would append onto the outgoing list. */}
        {isReloadingResults ? null : hasMoreJokes ? (
          <Button onClick={loadMoreFilteredJokes} disabled={loadingMoreJokes} variant="outline" size="lg">
            {loadingMoreJokes ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <ChevronDown className="mr-2 h-5 w-5" />
            )}
            {loadingMoreJokes ? 'Loading…' : 'Load More Jokes'}
          </Button>
        ) : (
          jokesToDisplay.length > 0 && (
            <p className="text-muted-foreground">No more jokes to load for the current filters.</p>
          )
        )}
      </div>
    </div>
  );
}

export default function JokesPage() {
  return (
    <Suspense fallback={<PageLoading label="Loading jokes…" />}>
      <JokesPageComponent />
    </Suspense>
  );
}
