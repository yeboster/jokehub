
"use client";

import type { Joke, Category, UserRating } from '@/lib/types';
import type React from 'react';
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from './AuthContext';
import * as jokeService from '@/services/jokeService';
import * as categoryService from '@/services/categoryService';
import * as ratingService from '@/services/ratingService';
import type { QueryDocumentSnapshot } from 'firebase/firestore';

export type FilterParams = jokeService.FilterParams;

interface JokeContextProps {
  jokes: Joke[] | null;
  categories: Category[] | null; 
  hasMoreJokes: boolean;
  loadingInitialJokes: boolean;
  loadingMoreJokes: boolean;
  addJoke: (newJokeData: { text: string; category: string; source?: string; funnyRate?: number }) => Promise<void>;
  importJokes: (importedJokesData: Omit<Joke, 'id' | 'used' | 'dateAdded' | 'userId'>[]) => Promise<void>;
  toggleUsed: (id: string, currentUsedStatus: boolean) => Promise<void>;
  getJokeById: (jokeId: string) => Promise<Joke | null>;
  updateJoke: (jokeId: string, updatedData: Partial<Omit<Joke, 'id' | 'dateAdded' | 'userId' | 'keywords'>>) => Promise<void>;
  deleteJoke: (jokeId: string) => Promise<void>;
  loadJokesWithFilters: (filters: FilterParams) => Promise<void>;
  loadMoreFilteredJokes: () => Promise<void>;
  submitUserRating: (jokeId: string, stars: number, comment?: string) => Promise<void>;
  fetchAllRatingsForJoke: (jokeId: string) => Promise<UserRating[]>;
}

const JokeContext = createContext<JokeContextProps | undefined>(undefined);

const defaultFilters: FilterParams = {
  selectedCategories: [],
  filterFunnyRate: -1,
  usageStatus: 'all',
  scope: 'public',
  search: '',
};

export const JokeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [jokes, setJokes] = useState<Joke[] | null>(null);
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [loadingInitialJokes, setLoadingInitialJokes] = useState<boolean>(true);
  const [loadingMoreJokes, setLoadingMoreJokes] = useState<boolean>(false);
  const [hasMoreJokes, setHasMoreJokes] = useState<boolean>(true);

  const lastVisibleJokeDocRef = useRef<QueryDocumentSnapshot | null>(null);
  const activeFiltersRef = useRef<FilterParams>(defaultFilters);

  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset categories to null while waiting for auth state, so consumers can distinguish "loading" from "loaded with []".
      setCategories(null);
      return;
    }
    if (!user) {
      // No authenticated user -> no user-scoped categories to subscribe to.
      // Explicit empty state when signed out; distinct from "still loading".
      setCategories([]);
      return;
    }
    const unsubscribe = categoryService.subscribeToUserCategories(
      user.uid,
      (newCategories) => {
        setCategories(newCategories);
      },
      (error) => {
        console.error('Error in category subscription (JokeContext):', error);
        toast({ title: 'Error fetching user categories', description: error.message, variant: 'destructive' });
        setCategories([]);
      }
    );
    return () => unsubscribe();
  }, [authLoading, user, toast]);

  const fetchJokesInternal = useCallback(async (filters: FilterParams, isLoadMore: boolean) => {
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

      if (isLoadMore) {
        setJokes((prevJokes) => (prevJokes ? [...prevJokes, ...newJokes] : newJokes));
      } else {
        setJokes(newJokes);
      }

      lastVisibleJokeDocRef.current = lastVisible;
      setHasMoreJokes(newHasMore);
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Firestore errors surface via `.message`/`.code`; unknown narrows too aggressively for the toast branch.
      const err = error as any;
      console.error('Error fetching jokes (JokeContext):', err);
      toast({ title: 'Error', description: err.message || 'Could not load jokes.', variant: 'destructive' });
      if (!isLoadMore) setJokes([]);
      setHasMoreJokes(false);
    } finally {
      if (isLoadMore) setLoadingMoreJokes(false);
      else setLoadingInitialJokes(false);
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


  useEffect(() => {
    if (authLoading || categories === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset jokes + loading flag whenever auth or categories regress back to a non-ready state.
      setJokes(null);
      setLoadingInitialJokes(true);
      return;
    }

    const currentFilters = activeFiltersRef.current;
    let filtersToUse = currentFilters;

    if (!user && currentFilters.scope === 'user') {
      filtersToUse = { ...currentFilters, scope: 'public' as const };
    }
    
    loadJokesWithFilters(filtersToUse);

  }, [authLoading, user, categories, loadJokesWithFilters]); 


  const handleApiCall = useCallback(
    async <T,>(
      apiCall: () => Promise<T>,
      successMessage: string,
      shouldReloadJokesList = false 
    ): Promise<T | undefined> => {
      if (!user && !['fetchAllRatingsForJoke', 'getJokeById'].includes(apiCall.name) ) { 
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- shared error handling for addJoke/importJokes/etc.; unknown narrows too aggressively given the string-membership checks below.
            const err = error as any;
            console.error('API call error (JokeContext):', err);
            if (!(err.message.includes("Category name cannot be empty") || err.message.includes("permission denied"))) {
                 toast({ title: 'Error', description: err.message || 'An unexpected error occurred.', variant: 'destructive' });
            }
            throw error;
          }
    },
    [user, toast, loadJokesWithFilters] 
  );

  const addJoke = useCallback(
    (newJokeData: { text: string; category: string; source?: string; funnyRate?: number }) => {
       if (!user) throw new Error("User not authenticated for adding joke.");
       return handleApiCall(() => jokeService.addJoke(newJokeData, user.uid), 'Joke added successfully!', true)!;
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
    (jokeId: string, updatedData: Partial<Omit<Joke, 'id' | 'dateAdded' | 'userId' | 'keywords'>>) => {
      if (!user) throw new Error("User not authenticated for updating joke.");
      return handleApiCall(
        () => jokeService.updateJoke(jokeId, updatedData, user.uid),
        'Joke updated successfully!',
        true 
      )!;
    },
    [handleApiCall, user]
  );

  const deleteJoke = useCallback(
    (jokeId: string) => {
        if (!user) throw new Error("User not authenticated for deleting a joke.");
        return handleApiCall(
            () => jokeService.deleteJoke(jokeId, user.uid),
            'Joke deleted successfully!',
            true 
        )!;
    },
    [handleApiCall, user]
  );

  const submitUserRating = useCallback(
    (jokeId: string, stars: number, comment?: string) => {
      if (!user) throw new Error("User not authenticated for submitting rating.");
      return handleApiCall(
        () => ratingService.submitUserRating(jokeId, stars, user.uid, comment),
        'Rating submitted successfully.',
        true 
      )!;
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

    
