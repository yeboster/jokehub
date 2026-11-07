"use client";

import { useCallback, useState } from 'react';
import { DEFAULT_GENERATE_MODEL, isGeminiModel, type GeminiModel } from '@/ai/models';

export const STUDIO_MODEL_KEY = 'jokehub:studio-model';

/** Stored value only if it is still in the catalog; storage may be blocked. */
function readRememberedModel(): GeminiModel {
  try {
    const stored = window.localStorage.getItem(STUDIO_MODEL_KEY);
    return isGeminiModel(stored) ? stored : DEFAULT_GENERATE_MODEL;
  } catch {
    return DEFAULT_GENERATE_MODEL;
  }
}

/**
 * The studio's model choice, remembered across visits. The lazy initializer
 * reads storage during the first client render; the studio only mounts after
 * auth resolves on the client, so there is no server markup to mismatch.
 */
export function useRememberedModel(): [GeminiModel, (value: string) => void] {
  const [model, setModel] = useState<GeminiModel>(readRememberedModel);
  const choose = useCallback((value: string) => {
    if (!isGeminiModel(value)) return;
    setModel(value);
    try { window.localStorage.setItem(STUDIO_MODEL_KEY, value); } catch { /* best-effort */ }
  }, []);
  return [model, choose];
}
