"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { normalizeJokeKey } from '@/lib/jokeGenerationContract';
import type { FeedbackCounts, FeedbackUpsertInput, GenerationFeedback } from '@/lib/tasteProfile';
import * as tasteService from '@/services/tasteService';
import type { TokenSource } from '@/services/tasteService';

type FeedbackState = { items: GenerationFeedback[]; counts: FeedbackCounts };
export type LoadStatus = 'loading' | 'ready' | 'error';

/** Same rule the server uses to pick liked examples for the taste profile. */
function isLiked(record: GenerationFeedback | null | undefined) {
  return !!record && (record.vote === 'up' || (record.saved && record.vote !== 'down'));
}
function isDisliked(record: GenerationFeedback | null | undefined) {
  return !!record && record.vote === 'down';
}

/**
 * Replace (or remove, when the server deleted it) the record for one joke and
 * move the counts by the difference, so the summary follows votes without a
 * reload.
 */
function applyRecord(previous: FeedbackState, jokeText: string, record: GenerationFeedback | null): FeedbackState {
  const key = normalizeJokeKey(jokeText);
  const old = previous.items.find(item => (record && item.id === record.id) || normalizeJokeKey(item.jokeText) === key);
  const items = previous.items.filter(item => item !== old);
  if (record) items.unshift(record);
  return {
    items,
    counts: {
      liked: Math.max(0, previous.counts.liked - Number(isLiked(old)) + Number(isLiked(record))),
      disliked: Math.max(0, previous.counts.disliked - Number(isDisliked(old)) + Number(isDisliked(record))),
    },
  };
}

const EMPTY: FeedbackState = { items: [], counts: { liked: 0, disliked: 0 } };

/** The user's feedback list and like/dislike counts. Mount under a uid-keyed parent. */
export function useGenerationFeedback(user: TokenSource) {
  const { toast } = useToast();
  const [state, setState] = useState<FeedbackState>(EMPTY);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [resetting, setResetting] = useState(false);
  const [removing, setRemoving] = useState<ReadonlySet<string>>(new Set());
  const mounted = useRef(true);
  const loadSequence = useRef(0);
  const auth = useRef(user);

  useLayoutEffect(() => {
    auth.current = user;
  }, [user]);

  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const fetchList = useCallback(async () => {
    const id = ++loadSequence.current;
    try {
      const { feedback, counts } = await tasteService.listFeedback(auth.current);
      if (!mounted.current || id !== loadSequence.current) return;
      setState({ items: feedback, counts });
      setStatus('ready');
    } catch (error) {
      if (!mounted.current || id !== loadSequence.current) return;
      console.error('Error loading generation feedback:', error);
      setStatus('error');
    }
  }, []);

  useEffect(() => { void fetchList(); }, [fetchList]);

  const load = useCallback(() => {
    setStatus('loading');
    return fetchList();
  }, [fetchList]);

  /** Sends one upsert; throws on failure so the caller can roll back. */
  const record = useCallback(async (input: FeedbackUpsertInput) => {
    const result = await tasteService.setFeedback(auth.current, input);
    if (mounted.current) setState(previous => applyRecord(previous, input.jokeText, result));
    return result;
  }, []);

  const remove = useCallback(async (item: GenerationFeedback) => {
    setRemoving(previous => new Set(previous).add(item.id));
    try {
      await record({ jokeText: item.jokeText, vote: null, saved: false });
      return true;
    } catch (error) {
      console.error('Error removing generation feedback:', error);
      if (mounted.current) toast({ title: "Couldn't remove feedback", description: 'Please try again.', variant: 'destructive' });
      return false;
    } finally {
      if (mounted.current) setRemoving(previous => { const next = new Set(previous); next.delete(item.id); return next; });
    }
  }, [record, toast]);

  const reset = useCallback(async () => {
    setResetting(true);
    try {
      await tasteService.clearFeedback(auth.current);
      if (!mounted.current) return false;
      loadSequence.current++;
      setState(EMPTY);
      setStatus('ready');
      toast({ title: 'Feedback reset', description: 'New batches no longer use your past votes.' });
      return true;
    } catch (error) {
      console.error('Error resetting generation feedback:', error);
      if (mounted.current) toast({ title: "Couldn't reset feedback", description: 'Please try again.', variant: 'destructive' });
      return false;
    } finally {
      if (mounted.current) setResetting(false);
    }
  }, [toast]);

  return { feedback: state.items, counts: state.counts, status, resetting, removing, load, record, remove, reset };
}

export type GenerationFeedbackApi = ReturnType<typeof useGenerationFeedback>;
