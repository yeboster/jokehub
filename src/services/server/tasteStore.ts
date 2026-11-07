/**
 * Per-user generation feedback and joke samples (Admin SDK only).
 *
 * Paths: users/{uid}/generationFeedback/{id}, users/{uid}/jokeSamples/{id}.
 * CONTRACT STUB — implemented by the taste-persistence workstream.
 */
import {
  emptyTasteProfile,
  type FeedbackUpsert, type GenerationFeedback, type JokeSample,
  type SampleCreate, type SampleUpdate, type TasteProfile,
} from '@/lib/tasteProfile';

export class SampleLimitError extends Error {
  readonly code = 'SAMPLE_LIMIT';
  constructor() { super('You can keep up to 50 samples. Delete one to add another.'); }
}

/** Returns the stored record, or null when the merge left nothing to keep (deleted). */
export async function upsertFeedback(_uid: string, _input: FeedbackUpsert): Promise<GenerationFeedback | null> {
  throw new Error('not implemented');
}

/** Newest first by updatedAt. */
export async function listFeedback(_uid: string, _limit?: number): Promise<GenerationFeedback[]> {
  throw new Error('not implemented');
}

/** Deletes every feedback record for the user; returns the count. */
export async function clearFeedback(_uid: string): Promise<number> {
  throw new Error('not implemented');
}

/** Newest first by createdAt. */
export async function listSamples(_uid: string): Promise<JokeSample[]> {
  throw new Error('not implemented');
}

/** Idempotent by normalized text; throws SampleLimitError at the cap. */
export async function createSample(_uid: string, _input: SampleCreate): Promise<{ sample: JokeSample; created: boolean }> {
  throw new Error('not implemented');
}

/** Null when the sample does not exist. */
export async function updateSample(_uid: string, _input: SampleUpdate): Promise<JokeSample | null> {
  throw new Error('not implemented');
}

export async function deleteSample(_uid: string, _id: string): Promise<boolean> {
  throw new Error('not implemented');
}

/** Never throws: storage failures yield an empty profile. */
export async function loadTasteProfile(_uid: string): Promise<TasteProfile> {
  return emptyTasteProfile();
}
