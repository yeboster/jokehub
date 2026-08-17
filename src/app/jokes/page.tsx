
"use client";

import { Suspense, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { ChevronDown, Loader2, PlusCircle, RotateCcw } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { useJokes } from '@/contexts/JokeContext';
import { useJokeFilters } from '@/hooks/useJokeFilters';
import { getFunnyRateLabel, hasActiveFilters } from '@/lib/jokeFilters';
import JokeFilterDialog from '@/components/jokes/JokeFilterDialog';
import JokeList from '@/components/joke-list';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

function JokesPageComponent() {
  const { user, loading: authLoading } = useAuth();
  const {
    jokes,
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
  useEffect(() => {
    if (authLoading) return;
    loadJokesWithFilters(filters);
  }, [authLoading, filters, loadJokesWithFilters]);

  const jokesToDisplay = useMemo(() => jokes ?? [], [jokes]);

  const isMyJokes = filters.scope === 'user' && !!user;
  const pageTitle = isMyJokes ? 'My Joke Collection' : 'All Jokes Feed';
  const pageDescription = isMyJokes
    ? 'Manage and filter your personal joke collection.'
    : 'Browse, filter, and enjoy jokes from the community. Add your own too!';

  if (authLoading || (loadingInitialJokes && jokes === null)) {
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

      <JokeList
        jokes={jokesToDisplay}
        emptyMessage={filters.search ? `No jokes matched “${filters.search}”.` : undefined}
        emptyHint={
          filters.search
            ? 'Search matches whole keywords of three or more letters. Try a single word, or clear the search.'
            : undefined
        }
      />

      <div className="mt-8 text-center">
        {hasMoreJokes ? (
          <Button onClick={loadMoreFilteredJokes} disabled={loadingMoreJokes} variant="outline" size="lg">
            {loadingMoreJokes ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <ChevronDown className="mr-2 h-5 w-5" />
            )}
            {loadingMoreJokes ? 'Loading...' : 'Load More Jokes'}
          </Button>
        ) : (
          jokesToDisplay.length > 0 && !loadingInitialJokes && (
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
