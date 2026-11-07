/**
 * Client access to /api/generation-feedback and /api/joke-samples.
 * CONTRACT STUB — implemented by the taste-persistence workstream.
 */
import type {
  FeedbackCounts, FeedbackUpsertInput, GenerationFeedback, JokeSample, SampleCreate, SampleUpdate,
} from '@/lib/tasteProfile';

/** A Firebase `User` satisfies this. */
export type TokenSource = { getIdToken(): Promise<string> };

export async function listFeedback(_auth: TokenSource, _limit?: number): Promise<{ feedback: GenerationFeedback[]; counts: FeedbackCounts }> {
  throw new Error('not implemented');
}

export async function setFeedback(_auth: TokenSource, _input: FeedbackUpsertInput): Promise<GenerationFeedback | null> {
  throw new Error('not implemented');
}

export async function clearFeedback(_auth: TokenSource): Promise<number> {
  throw new Error('not implemented');
}

export async function listSamples(_auth: TokenSource): Promise<JokeSample[]> {
  throw new Error('not implemented');
}

export async function createSample(_auth: TokenSource, _input: SampleCreate): Promise<{ sample: JokeSample; created: boolean }> {
  throw new Error('not implemented');
}

export async function updateSample(_auth: TokenSource, _input: SampleUpdate): Promise<JokeSample> {
  throw new Error('not implemented');
}

export async function deleteSample(_auth: TokenSource, _id: string): Promise<boolean> {
  throw new Error('not implemented');
}
