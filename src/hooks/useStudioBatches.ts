"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  prependBatch, readStoredBatches, sessionStorageOrNull, writeStoredBatches,
  type StudioBatch, type StudioJoke,
} from '@/lib/studioBatches';

/**
 * The session's generated batches for one uid, newest first, mirrored to
 * `sessionStorage`. Mount it under a uid-keyed parent: the initial read
 * happens once.
 */
export function useStudioBatches(uid: string) {
  const [batches, setBatches] = useState<StudioBatch[]>(() => readStoredBatches(sessionStorageOrNull(), uid));
  // Handlers read the latest committed list without re-subscribing.
  const latest = useRef(batches);
  useLayoutEffect(() => {
    latest.current = batches;
  }, [batches]);

  useEffect(() => {
    writeStoredBatches(sessionStorageOrNull(), uid, batches);
  }, [uid, batches]);

  const addBatch = useCallback((batch: StudioBatch) => {
    setBatches(previous => prependBatch(previous, batch));
  }, []);

  const updateJokes = useCallback((matches: (joke: StudioJoke) => boolean, update: (joke: StudioJoke) => StudioJoke) => {
    setBatches(previous => previous.map(batch => batch.jokes.some(matches)
      ? { ...batch, jokes: batch.jokes.map(joke => matches(joke) ? update(joke) : joke) }
      : batch));
  }, []);

  const updateJoke = useCallback((jokeId: string, update: (joke: StudioJoke) => StudioJoke) => {
    updateJokes(joke => joke.id === jokeId, update);
  }, [updateJokes]);

  const findJoke = useCallback((jokeId: string) => {
    for (const batch of latest.current) {
      const joke = batch.jokes.find(entry => entry.id === jokeId);
      if (joke) return { batch, joke };
    }
    return null;
  }, []);

  return { batches, addBatch, updateJoke, updateJokes, findJoke };
}
