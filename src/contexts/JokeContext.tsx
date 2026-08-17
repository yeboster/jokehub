
"use client";

import type { Joke, Category, UserRating } from '@/lib/types';
import type React from 'react';
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from './AuthContext';
import * as jokeService from '@/services/jokeService';
import * as categoryService from '@/services/categoryService';
import * as ratingService from '@/services/ratingService';
import { DEFAULT_FILTERS } from '@/lib/jokeFilters';
import type { QueryDocumentSnapshot } from 'firebase/firestore';

export type FilterParams = jokeService.FilterParams;

interface JokeContextProps {
  jokes: Joke[] | null;
  categories: Category[] | null;
  hasMoreJokes: boolean;
  loadingInitialJokes: boolean;
  loadingMoreJokes: boolean;
  loadingCategories: boolean;
  addJoke: (newJokeData: { text: string; category: string; source?: string; funnyRate?: number }) => Promise<void>;
  importJokes: (importedJokesData: Omit<Joke, 'id' | 'used' | 'dateAdded' | 'userId'>[]) => Promise<void>;
  toggleUsed: (id: string, currentUsedStatus: boolean) => Promise<void>;
  getJokeById: (jokeId: string) => Promise<Joke | null>;
  updateJoke: (jokeId: string, updatedData: Partial<Omit<Joke, 'id' | 'dateAdded' | 'userId' | 'keywords'>>) => Promise<void>;
  deleteJoke: (jokeId: string) => Promise<void>;
  loadJokesWithFilters: (filters: FilterParams) => Promise<void>;
  loadMoreFilteredJokes: () => Promise<void>;
  submitUserRating: (
    jokeId: string,
    stars: number,
    comment?: string
  ) => Promise<ratingService.RatingAggregates | undefined>;
  fetchAllRatingsForJoke: (jokeId: string) => Promise<UserRating[]>;
}

const JokeContext = createContext<JokeContextProps | undefined>(undefined);

export const JokeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [jokes, setJokes] = useState<Joke[] | null>(null);
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [loadingInitialJokes, setLoadingInitialJokes] = useState<boolean>(true);
  const [loadingMoreJokes, setLoadingMoreJokes] = useState<boolean>(false);
  const [loadingCategories, setLoadingCategories] = useState<boolean>(true);
  const [hasMoreJokes, setHasMoreJokes] = useState<boolean>(true);

  const lastVisibleJokeDocRef = useRef<QueryDocumentSnapshot | null>(null);
  const activeFiltersRef = useRef<FilterParams>(DEFAULT_FILTERS);
  /**
   * Monotonic id for joke fetches. Every `fetchJokesInternal` call claims the
   * next id; once it resolves it applies its result only if it is still the
   * newest request. Without this, a slow response from an old filter set can
   * land after a newer one and overwrite it.
   */
  const jokeRequestIdRef = useRef(0);
  /**
   * Newest request id per fetch kind. The loading flags are per-kind, so each
   * one must be cleared by the newest request of *its own* kind — otherwise a
   * superseded fetch can leave its spinner stuck on forever.
   */
  const newestRequestByKindRef = useRef<{ initial: number; more: number }>({ initial: 0, more: 0 });

  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset categories to null while waiting for auth state, so consumers can distinguish "loading" from "loaded with []".
      setCategories(null);
      setLoadingCategories(true);
      return;
    }
    if (!user) {
      // No authenticated user -> no user-scoped categories to subscribe to.
      // Explicit empty state when signed out; distinct from "still loading".
      setCategories([]);
      setLoadingCategories(false);
      return;
    }
    // Drop the previous user's categories while the new subscription loads —
    // otherwise a user switch briefly shows the old account's category list as
    // if it were loaded.
    setCategories(null);
    setLoadingCategories(true);
    const unsubscribe = categoryService.subscribeToUserCategories(
      user.uid,
      (newCategories) => {
        setCategories(newCategories);
        setLoadingCategories(false);
      },
      (error) => {
        console.error('Error in category subscription (JokeContext):', error);
        toast({ title: 'Error fetching user categories', description: error.message, variant: 'destructive' });
        setCategories([]);
        setLoadingCategories(false);
      }
    );
    return () => unsubscribe();
  }, [authLoading, user, toast]);

  const fetchJokesInternal = useCallback(async (filters: FilterParams, isLoadMore: boolean) => {
    const requestId = ++jokeRequestIdRef.current;
    const kind = isLoadMore ? 'more' : 'initial';
    newestRequestByKindRef.current[kind] = requestId;
    const isStale = () => requestId !== jokeRequestIdRef.current;
    const ownsLoadingFlag = () => newestRequestByKindRef.current[kind] === requestId;

    if (filters.scope === 'user' && !user) {
      setJokes([]);
      setHasMoreJokes(false);
      if (isLoadMore) setLoadingMoreJokes(false); else setLoadingInitialJokes(false);
      return;
    }

    if (isLoadMore) {
      setLoadingMoreJokes(true);
    } else {
      setLoadingInitialJokes(true);
      setJokes(null);
      lastVisibleJokeDocRef.current = null;
    }

    try {
      const {
        jokes: newJokes,
        lastVisible,
        hasMore: newHasMore,
      } = await jokeService.fetchJokes(
        filters,
        user?.uid,
        isLoadMore ? lastVisibleJokeDocRef.current : undefined
      );

      // A newer fetch started while this one was in flight — drop the result
      // rather than clobbering the newer filter set's jokes/cursor.
      if (isStale()) return;

      if (isLoadMore) {
        setJokes((prevJokes) => (prevJokes ? [...prevJokes, ...newJokes] : newJokes));
      } else {
        setJokes(newJokes);
      }

      lastVisibleJokeDocRef.current = lastVisible;
      setHasMoreJokes(newHasMore);
    } catch (error) {
      if (isStale()) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Firestore errors surface via `.message`/`.code`; unknown narrows too aggressively for the toast branch.
      const err = error as any;
      console.error('Error fetching jokes (JokeContext):', err);
      toast({ title: 'Error', description: err.message || 'Could not load jokes.', variant: 'destructive' });
      if (!isLoadMore) setJokes([]);
      setHasMoreJokes(false);
    } finally {
      // A stale response must not clear the spinner belonging to the fetch
      // that superseded it.
      if (ownsLoadingFlag()) {
        if (isLoadMore) setLoadingMoreJokes(false);
        else setLoadingInitialJokes(false);
      }
    }
  }, [user, toast]);

  const loadJokesWithFilters = useCallback(
    async (filters: FilterParams) => {
      activeFiltersRef.current = filters; 
      await fetchJokesInternal(filters, false); 
    },
    [fetchJokesInternal] 
  );
  
  const loadMoreFilteredJokes = useCallback(async () => {
    if (!hasMoreJokes || loadingMoreJokes) return; 
    await fetchJokesInternal(activeFiltersRef.current, true);
  }, [fetchJokesInternal, hasMoreJokes, loadingMoreJokes]); 


  // Fetching is page-owned: each page calls `loadJokesWithFilters` with exactly
  // the query it renders (see /jokes and the home page). The provider
  // deliberately has no auto-fetch effect — it used to race every consumer's
  // own fetch and made the detail/edit pages pay for a list they never show.

  const handleApiCall = useCallback(
    async <T,>(
      apiCall: () => Promise<T>,
      successMessage: string,
      shouldReloadJokesList = false 
    ): Promise<T | undefined> => {
      if (!user) {
        toast({
          title: 'Authentication Required',
          description: 'Please log in.',
          variant: 'destructive',
        });
        return undefined;
      }
      try {
        const result = await apiCall();
        if (successMessage) {
            toast({ title: 'Success', description: successMessage });
        }
        if (shouldReloadJokesList && (user || activeFiltersRef.current.scope === 'public')) { 
          await loadJokesWithFilters(activeFiltersRef.current); 
        }
        return result;
      } catch (error) {
        // A non-Error throw (a string, a rejected value) must not turn into a
        // second TypeError here and mask the original failure.
        const message = error instanceof Error ? error.message : String(error);
        console.error('API call error (JokeContext):', error);
        // These two stay silent here — the callers surface them in context
        // (form validation for the category, the rules error for permissions).
        if (!(message.includes('Category name cannot be empty') || message.includes('permission denied'))) {
          toast({ title: 'Error', description: message || 'An unexpected error occurred.', variant: 'destructive' });
        }
        throw error;
      }
    },
    [user, toast, loadJokesWithFilters] 
  );

  // No list reload: the mounted page owns its list. A brand-new joke can't be
  // spliced into a filtered, paginated list without re-running the query
  // (nothing here knows whether it matches the active filters), and the add
  // flow navigates to /jokes afterwards, which fetches on mount anyway.
  const addJoke = useCallback(
    (newJokeData: { text: string; category: string; source?: string; funnyRate?: number }) => {
       if (!user) throw new Error("User not authenticated for adding joke.");
       return handleApiCall(() => jokeService.addJoke(newJokeData, user.uid), 'Joke added successfully!', false)!;
    },
    [handleApiCall, user]
  );

  const importJokes = useCallback(
    (importedJokesData: Omit<Joke, 'id' | 'used' | 'dateAdded' | 'userId'>[]) => {
      if (!user) throw new Error("User not authenticated for importing jokes.");
      return handleApiCall(
        () => jokeService.importJokes(importedJokesData, user.uid),
        `Processed ${importedJokesData.length} jokes.`,
        true
      )!;
    },
    [handleApiCall, user]
  );

  const toggleUsed = useCallback(
    async (id: string, currentUsedStatus: boolean) => { 
      if (!user) throw new Error("User not authenticated for toggling joke status.");
      await handleApiCall(
        () => jokeService.toggleJokeUsed(id, user.uid), 
        'Joke status updated.',
        false 
      );
      setJokes((prevJokes) =>
        prevJokes
          ? prevJokes.map((j) => (j.id === id ? { ...j, used: !currentUsedStatus } : j))
          : null
      );
    },
    [handleApiCall, user]
  );

  const getJokeById = useCallback(
    async (jokeId: string): Promise<Joke | null> => {
      try {
        const joke = await jokeService.getJokeById(jokeId);
        return joke;
      } catch (error) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Firestore get-by-id errors expose `.message`/`.code`; unknown narrows too aggressively for the toast description string.
            const err = error as any;
            console.error('Error in getJokeById (JokeContext):', err);
            toast({ title: 'Error Fetching Joke', description: err.message || 'Could not fetch joke details.', variant: 'destructive' });
            return null;
          }
    },
    [toast] 
  );
  
  const updateJoke = useCallback(
    async (jokeId: string, updatedData: Partial<Omit<Joke, 'id' | 'dateAdded' | 'userId' | 'keywords'>>) => {
      if (!user) throw new Error("User not authenticated for updating joke.");
      await handleApiCall(
        () => jokeService.updateJoke(jokeId, updatedData, user.uid),
        'Joke updated successfully!',
        false
      );
      // Patch the one joke that changed instead of refetching the whole list
      // (as `toggleUsed` does). Category casing may be normalized server-side;
      // the next fetch reconciles that.
      setJokes((prevJokes) =>
        prevJokes ? prevJokes.map((j) => (j.id === jokeId ? { ...j, ...updatedData } : j)) : null
      );
    },
    [handleApiCall, user]
  );

  const deleteJoke = useCallback(
    async (jokeId: string) => {
        if (!user) throw new Error("User not authenticated for deleting a joke.");
        await handleApiCall(
            () => jokeService.deleteJoke(jokeId, user.uid),
            'Joke deleted successfully!',
            false
        );
        setJokes((prevJokes) => (prevJokes ? prevJokes.filter((j) => j.id !== jokeId) : null));
    },
    [handleApiCall, user]
  );

  const submitUserRating = useCallback(
    async (jokeId: string, stars: number, comment?: string) => {
      if (!user) throw new Error("User not authenticated for submitting rating.");
      // No list reload: the rating transaction returns the new aggregates, so
      // the one joke that changed is patched in place (as `toggleUsed` does)
      // and the caller can apply the same values to its own copy.
      const aggregates = await handleApiCall(
        () => ratingService.submitUserRating(jokeId, stars, user.uid, comment),
        'Rating submitted successfully.',
        false
      );
      if (aggregates) {
        setJokes((prevJokes) =>
          prevJokes
            ? prevJokes.map((j) => (j.id === jokeId ? { ...j, ...aggregates } : j))
            : null
        );
      }
      return aggregates;
    },
    [handleApiCall, user]
  );

  const fetchAllRatingsForJoke = useCallback(
    async (jokeId: string): Promise<UserRating[]> => {
      try {
        return await ratingService.fetchAllRatingsForJoke(jokeId);
      } catch (error) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- collection-group queries surface heterogeneous Firestore error shapes; unknown loses the log/console access pattern.
            const err = error as any;
            console.error('Error fetching all ratings in context:', err);
            toast({ title: 'Error', description: 'Could not load community ratings.', variant: 'destructive' });
            return [];
          }
    },
    [toast]
  );

  const value: JokeContextProps = {
    jokes,
    categories,
    hasMoreJokes,
    loadingInitialJokes,
    loadingMoreJokes,
    loadingCategories,
    addJoke,
    importJokes,
    toggleUsed,
    getJokeById,
    updateJoke,
    deleteJoke,
    loadJokesWithFilters,
    loadMoreFilteredJokes,
    submitUserRating,
    fetchAllRatingsForJoke,
  };

  return <JokeContext.Provider value={value}>{children}</JokeContext.Provider>;
};

export const useJokes = (): JokeContextProps => {
  const context = useContext(JokeContext);
  if (context === undefined) {
    throw new Error('useJokes must be used within a JokeProvider');
  }
  return context;
};

    
