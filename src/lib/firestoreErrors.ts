import type { FirestoreError } from 'firebase/firestore';

/**
 * True when a Firestore query failed because a required composite index
 * doesn't exist yet (either not deployed or still building).
 */
export function isMissingIndexError(error: unknown): boolean {
  const code = (error as Partial<FirestoreError> | undefined)?.code;
  const message = error instanceof Error ? error.message : String(error);
  return code === 'failed-precondition' || message.includes('requires an index');
}

/**
 * Logs a single warning for a missing-index fallback, surfacing the
 * index-creation URL Firestore embeds in the error message when present.
 */
export function warnMissingIndex(context: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const urlMatch = message.match(/https:\/\/console\.firebase\.google\.com\S*/);
  console.warn(
    `[${context}] Firestore composite index missing; falling back to client-side sort.` +
      (urlMatch ? ` Create it here: ${urlMatch[0]}` : ` Error: ${message}`)
  );
}
