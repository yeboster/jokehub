"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { GenerationResultSchema, type GenerationResult, type JokeMode } from '@/lib/jokeGenerationContract';
import { readGenerationStream, type GenerationStage } from '@/lib/generationProgress';

export type GenerationRequest = {
  topicHint: string;
  model: string;
  temperature: number;
  count: number;
  mode: JokeMode;
  useTasteProfile: boolean;
  recentGeneratedJokes: string[];
};

type Generated = { result: GenerationResult; request: GenerationRequest; requestId: string | null };

/**
 * One `/api/generate-joke` request at a time, with streamed progress.
 * Mount under a uid-keyed parent: unmounting aborts the request and every
 * late completion (token, fetch, stream frame, JSON) is ignored.
 */
export function useJokeGeneration(user: { getIdToken(): Promise<string> }, onGenerated: (generated: Generated) => void) {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressStage, setProgressStage] = useState<GenerationStage | null>(null);
  const [progressModel, setProgressModel] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const mounted = useRef(true);
  const sequence = useRef(0);
  const generation = useRef<{ id: number; controller: AbortController } | null>(null);
  const latestOnGenerated = useRef(onGenerated);
  useLayoutEffect(() => {
    latestOnGenerated.current = onGenerated;
  }, [onGenerated]);

  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current?.controller.abort();
      generation.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isGenerating) return;
    const started = Date.now();
    const timer = setInterval(() => setElapsedSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [isGenerating]);

  const generate = useCallback(async (request: GenerationRequest) => {
    // State updates are batched: ref ownership blocks same-render double clicks.
    if (generation.current) return;
    const operation = { id: ++sequence.current, controller: new AbortController() };
    generation.current = operation;
    const current = () => mounted.current && generation.current?.id === operation.id;
    let lastRequestId: string | null = null;
    setIsGenerating(true);
    setProgressStage(null);
    setProgressModel(null);
    setRequestId(null);
    setError(null);
    setElapsedSeconds(0);
    try {
      const idToken = await user.getIdToken();
      if (!current()) return;
      const response = await fetch('/api/generate-joke', {
        method: 'POST',
        signal: operation.controller.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify(request),
      });
      if (!current()) return;
      lastRequestId = response.headers?.get('x-request-id') ?? null;
      setRequestId(lastRequestId);
      if (!response.ok) {
        let errorData;
        try { errorData = await response.json(); } catch { /* preserve HTTP error */ }
        if (!current()) return;
        throw new Error(errorData?.error || `API request failed with status ${response.status}`);
      }
      const payload: unknown = response.headers?.get('content-type')?.includes('application/x-ndjson') && response.body
        ? await readGenerationStream(response.body, frame => {
          if (!current()) return;
          lastRequestId = frame.requestId;
          setRequestId(frame.requestId);
          if (frame.type === 'progress') {
            setProgressStage(frame.stage);
            if (frame.model) setProgressModel(frame.model);
          }
        })
        : await response.json();
      if (!current()) return;
      const parsed = GenerationResultSchema.safeParse(payload);
      if (!parsed.success) throw new Error('The joke service sent an unexpected response. Please try again.');
      const result = parsed.data;
      latestOnGenerated.current({ result, request, requestId: lastRequestId });
      toast(result.jokes.length < result.requestedCount
        ? { title: 'Jokes ready', description: `Only ${result.jokes.length} of ${result.requestedCount} passed the quality check.` }
        : { title: 'Jokes ready', description: `${result.jokes.length} new jokes are at the top of the list.` });
    } catch (caught) {
      if (!current()) return;
      const message = caught instanceof Error ? caught.message : 'Failed to generate jokes.';
      setError(message);
      toast({ title: "Couldn't generate jokes", description: message, variant: 'destructive' });
    } finally {
      if (current()) {
        generation.current = null;
        setIsGenerating(false);
      }
    }
  }, [user, toast]);

  return { generate, isGenerating, progressStage, progressModel, requestId, error, elapsedSeconds };
}
