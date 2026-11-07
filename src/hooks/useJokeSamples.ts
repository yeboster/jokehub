"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { JOKE_GENERATION_LIMITS, normalizeJokeKey } from '@/lib/jokeGenerationContract';
import { TASTE_LIMITS, type JokeSample } from '@/lib/tasteProfile';
import * as jokeService from '@/services/jokeService';
import * as tasteService from '@/services/tasteService';
import type { TokenSource } from '@/services/tasteService';
import type { LoadStatus } from '@/hooks/useGenerationFeedback';

export type AddSampleOutcome = 'created' | 'existing' | 'limit' | 'error';
export type ImportReport = { added: number; skipped: number; failed: number; stoppedAtLimit: boolean; found: number };

const LIMIT_MESSAGE = `You can keep up to ${TASTE_LIMITS.maxSamples} samples. Delete one to add another.`;

/** The server answers a full sample list with code `SAMPLE_LIMIT` (HTTP 409). */
function isSampleLimitError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const { code, status, message } = error as { code?: unknown; status?: unknown; message?: unknown };
  return code === 'SAMPLE_LIMIT' || status === 409 || (typeof message === 'string' && message.includes('SAMPLE_LIMIT'));
}

function upsert(samples: JokeSample[], sample: JokeSample) {
  return [sample, ...samples.filter(entry => entry.id !== sample.id)];
}

function isUsableText(text: unknown): text is string {
  return typeof text === 'string' && text.length <= JOKE_GENERATION_LIMITS.contextTextChars && !!normalizeJokeKey(text);
}

/** The user's sample jokes. Mount under a uid-keyed parent. */
export function useJokeSamples(user: TokenSource & { uid: string }) {
  const { toast } = useToast();
  const [samples, setSamples] = useState<JokeSample[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [adding, setAdding] = useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const mounted = useRef(true);
  const latest = useRef(samples);
  const auth = useRef(user);
  useLayoutEffect(() => {
    latest.current = samples;
    auth.current = user;
  }, [samples, user]);
  // Same-render guards; state flags only disable buttons after a re-render.
  const addingKeys = useRef(new Set<string>());
  const importRunning = useRef(false);

  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const fetchList = useCallback(async () => {
    try {
      const loaded = await tasteService.listSamples(auth.current);
      if (!mounted.current) return;
      setSamples(loaded);
      setStatus('ready');
    } catch (error) {
      if (!mounted.current) return;
      console.error('Error loading samples:', error);
      setStatus('error');
    }
  }, []);

  useEffect(() => { void fetchList(); }, [fetchList]);

  const load = useCallback(() => {
    setStatus('loading');
    return fetchList();
  }, [fetchList]);

  const hasSample = useCallback((text: string) => {
    const key = normalizeJokeKey(text);
    return samples.some(sample => normalizeJokeKey(sample.text) === key);
  }, [samples]);

  const isAdding = useCallback((text: string) => adding.has(normalizeJokeKey(text)), [adding]);

  const setFlag = (setter: typeof setAdding, key: string, on: boolean) => {
    setter(previous => { const next = new Set(previous); if (on) next.add(key); else next.delete(key); return next; });
  };

  const add = useCallback(async (text: string, note?: string): Promise<AddSampleOutcome> => {
    const key = normalizeJokeKey(text);
    if (!key || addingKeys.current.has(key)) return 'error';
    if (latest.current.length >= TASTE_LIMITS.maxSamples) {
      toast({ title: 'Sample limit reached', description: LIMIT_MESSAGE, variant: 'destructive' });
      return 'limit';
    }
    addingKeys.current.add(key);
    setFlag(setAdding, key, true);
    try {
      const trimmedNote = note?.trim();
      const { sample, created } = await tasteService.createSample(auth.current, { text, ...(trimmedNote ? { note: trimmedNote } : {}) });
      if (!mounted.current) return created ? 'created' : 'existing';
      setSamples(previous => upsert(previous, sample));
      toast(created
        ? { title: 'Sample added', description: 'New batches will use it as a style target.' }
        : { title: 'Already a sample', description: 'Already in your samples.' });
      return created ? 'created' : 'existing';
    } catch (error) {
      console.error('Error adding sample:', error);
      if (!mounted.current) return 'error';
      if (isSampleLimitError(error)) {
        toast({ title: 'Sample limit reached', description: LIMIT_MESSAGE, variant: 'destructive' });
        return 'limit';
      }
      toast({ title: "Couldn't add sample", description: 'Please try again.', variant: 'destructive' });
      return 'error';
    } finally {
      addingKeys.current.delete(key);
      if (mounted.current) setFlag(setAdding, key, false);
    }
  }, [toast]);

  const setActive = useCallback(async (sample: JokeSample, active: boolean) => {
    setFlag(setPending, sample.id, true);
    setSamples(previous => previous.map(entry => entry.id === sample.id ? { ...entry, active } : entry));
    try {
      const updated = await tasteService.updateSample(auth.current, { id: sample.id, active });
      if (mounted.current) setSamples(previous => previous.map(entry => entry.id === sample.id ? updated : entry));
    } catch (error) {
      console.error('Error updating sample:', error);
      if (!mounted.current) return;
      setSamples(previous => previous.map(entry => entry.id === sample.id ? { ...entry, active: sample.active } : entry));
      toast({ title: "Couldn't update sample", description: 'Please try again.', variant: 'destructive' });
    } finally {
      if (mounted.current) setFlag(setPending, sample.id, false);
    }
  }, [toast]);

  const remove = useCallback(async (sample: JokeSample) => {
    setFlag(setPending, sample.id, true);
    try {
      await tasteService.deleteSample(auth.current, sample.id);
      if (mounted.current) setSamples(previous => previous.filter(entry => entry.id !== sample.id));
    } catch (error) {
      console.error('Error deleting sample:', error);
      if (mounted.current) toast({ title: "Couldn't delete sample", description: 'Please try again.', variant: 'destructive' });
    } finally {
      if (mounted.current) setFlag(setPending, sample.id, false);
    }
  }, [toast]);

  /** Adds the user's recent 5-star jokes one by one, stopping at the cap. */
  const importFiveStar = useCallback(async (): Promise<ImportReport | null> => {
    if (importRunning.current) return null;
    importRunning.current = true;
    setImporting(true);
    const report: ImportReport = { added: 0, skipped: 0, failed: 0, stoppedAtLimit: false, found: 0 };
    try {
      const texts = (await jokeService.fetchUserFiveStarJokes(auth.current.uid)).filter(isUsableText);
      report.found = texts.length;
      let count = latest.current.length;
      for (const text of texts) {
        if (!mounted.current) return null;
        if (count >= TASTE_LIMITS.maxSamples) { report.stoppedAtLimit = true; break; }
        try {
          const { sample, created } = await tasteService.createSample(auth.current, { text });
          if (created) { report.added++; count++; } else { report.skipped++; }
          if (mounted.current) setSamples(previous => upsert(previous, sample));
        } catch (error) {
          if (isSampleLimitError(error)) { report.stoppedAtLimit = true; break; }
          console.error('Error importing sample:', error);
          report.failed++;
        }
      }
      if (!mounted.current) return null;
      if (report.found === 0) {
        toast({ title: 'No 5-star jokes yet', description: 'Rate a few jokes five stars and try again.' });
      } else {
        const parts = [`Added ${report.added}, skipped ${report.skipped} already in your samples.`];
        if (report.failed) parts.push(`${report.failed} could not be added.`);
        if (report.stoppedAtLimit) parts.push(`Stopped at the ${TASTE_LIMITS.maxSamples}-sample limit.`);
        toast({ title: 'Import finished', description: parts.join(' ') });
      }
      return report;
    } catch (error) {
      console.error('Error loading 5-star jokes:', error);
      if (mounted.current) toast({ title: "Couldn't load your jokes", description: 'Your 5-star jokes could not be loaded. Please try again.', variant: 'destructive' });
      return null;
    } finally {
      importRunning.current = false;
      if (mounted.current) setImporting(false);
    }
  }, [toast]);

  return { samples, status, pending, importing, load, add, setActive, remove, importFiveStar, hasSample, isAdding };
}

export type JokeSamplesApi = ReturnType<typeof useJokeSamples>;
