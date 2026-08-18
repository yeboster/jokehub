
"use client";

import { Suspense, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { ChevronDown, Loader2, PlusCircle, RotateCcw } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { useJokes } from '@/contexts/JokeContext';
import { useJokeFilters } from '@/hooks/useJokeFilters';
import type { FilterParams } from '@/services/jokeService';
import { filtersEqual, getFunnyRateLabel, hasActiveFilters } from '@/lib/jokeFilters';
import JokeFilterDialog from '@/components/jokes/JokeFilterDialog';
import JokeList from '@/components/joke-list';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

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
          className="flex flex-col rounded-lg border border-primary/20 bg-card shadow-lg overflow-hidden"
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

  // A multi-word search is only partly expressible as a Firestore query, so the
  // service AND-s the remaining tokens client-side and can hand back an empty
  // page while later pages still hold matches (it pages on, but gives up after
  // a bounded number of pages). Claiming "no jokes matched" right above an
  // enabled "Load More" button would be a lie, so say what we actually know.
  const searchExhausted = !hasMoreJokes;
  const emptyMessage = filters.search
    ? searchExhausted
      ? `No jokes matched “${filters.search}”.`
      : `No jokes on this page matched “${filters.search}”.`
    : undefined;
  const emptyHint = filters.search
    ? searchExhausted
      ? 'Search matches whole keywords of three or more letters. Try a single word, or clear the search.'
      : 'There may be matches further down — load more to keep looking.'
    : undefined;

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
    return (
      <div className="container mx-auto p-4 md:p-8 flex flex-col justify-center items-center min-h-[calc(100vh-8rem)]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-2 text-muted-foreground">Loading jokes...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-8">
      <header className="mb-8 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-primary sm:text-5xl">{pageTitle}</h1>
        <p className="mt-3 text-lg text-muted-foreground sm:text-xl">{pageDescription}</p>
      </header>

      <div className="mb-6 p-4 flex items-center gap-x-2 gap-y-3 border-b pb-6">
        <JokeFilterDialog value={filters} onApply={applyFilters} />

        <div className="flex flex-wrap items-center gap-2 flex-grow min-h-[36px]">
          {filters.search && (
            <Badge variant="secondary" className="py-1 px-2">Search: &quot;{filters.search}&quot;</Badge>
          )}
          {isMyJokes && (
            <Badge variant="secondary" className="py-1 px-2 bg-primary/10 text-primary border-primary/30">Showing: My Jokes</Badge>
          )}
          {filters.selectedCategories.map((category) => (
            <Badge key={category} variant="secondary" className="py-1 px-2">Category: {category}</Badge>
          ))}
          {filters.filterFunnyRate !== -1 && (
            <Badge variant="secondary" className="py-1 px-2">Rating: {getFunnyRateLabel(filters.filterFunnyRate)}</Badge>
          )}
          {filters.usageStatus === 'used' && (
            <Badge variant="secondary" className="py-1 px-2">Status: Used</Badge>
          )}
          {filters.usageStatus === 'unused' && (
            <Badge variant="secondary" className="py-1 px-2">Status: Unused</Badge>
          )}
        </div>

        <div className="flex items-center ml-auto">
          <Button variant="default" size="sm" className="h-9" asChild>
            <Link href={user ? '/add-joke' : '/auth?redirect=/add-joke'}>
              <PlusCircle className="mr-2 h-4 w-4" />
              {user ? 'Add New Joke' : 'Log in to Add Jokes'}
            </Link>
          </Button>

          {hasActiveFilters(filters) && (
            <Button variant="ghost" onClick={clearFilters} className="ml-2 text-sm p-2 h-auto self-center">
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
          emptyMessage={emptyMessage}
          emptyHint={emptyHint}
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
            {loadingMoreJokes ? 'Loading...' : 'Load More Jokes'}
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
    <Suspense fallback={
      <div className="container mx-auto p-4 md:p-8 flex flex-col justify-center items-center min-h-[calc(100vh-8rem)]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-2 text-muted-foreground">Loading page...</p>
      </div>
    }>
      <JokesPageComponent />
    </Suspense>
  );
}
