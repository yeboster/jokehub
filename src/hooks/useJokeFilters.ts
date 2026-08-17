"use client";

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import type { FilterParams } from '@/services/jokeService';
import { filtersToSearchParams, parseFiltersFromParams } from '@/lib/jokeFilters';

const JOKES_PATH = '/jokes';

export interface UseJokeFiltersResult {
  /** The filters the feed should currently show, derived from the URL. */
  filters: FilterParams;
  /** Navigates to the URL that represents `next`; `filters` follows from that. */
  applyFilters: (next: FilterParams) => void;
  /** Back to the unfiltered feed. */
  clearFilters: () => void;
}

/**
 * The URL is the single source of truth for the joke feed's filters.
 *
 * `filters` is *derived* from the query string rather than mirrored into state
 * by an effect. That removes the mount-time window where state still held the
 * defaults while the URL asked for something else — the window that previously
 * needed a "have the URL filters synced yet?" ref to stop the page firing one
 * query with the defaults and a second with the real filters. A deep link now
 * renders with its filters already in hand, so the page fetches exactly once.
 */
export function useJokeFilters(): UseJokeFiltersResult {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  // Keyed on the serialized query string, not the params object: the memo must
  // return a referentially stable object across re-renders that don't change
  // the URL, because the page's fetch effect depends on its identity.
  const queryString = searchParams.toString();
  const isSignedIn = !!user;

  const filters = useMemo(() => {
    const parsed = parseFiltersFromParams(new URLSearchParams(queryString));
    // "My Jokes" needs a signed-in user. A signed-out deep link falls back to
    // the public feed without rewriting the URL, so the requested scope takes
    // effect on its own once the user logs in.
    return parsed.scope === 'user' && !isSignedIn
      ? { ...parsed, scope: 'public' as const }
      : parsed;
  }, [queryString, isSignedIn]);

  const applyFilters = useCallback(
    (next: FilterParams) => {
      const query = filtersToSearchParams(next).toString();
      router.push(query ? `${JOKES_PATH}?${query}` : JOKES_PATH);
    },
    [router]
  );

  const clearFilters = useCallback(() => {
    router.push(JOKES_PATH);
  }, [router]);

  return { filters, applyFilters, clearFilters };
}
