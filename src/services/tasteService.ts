/**
 * Client access to the feedback (`FEEDBACK_API_PATH`) and samples
 * (`SAMPLES_API_PATH`) routes. Client-safe: plain fetch with the signed-in
 * user's Firebase ID token.
 */
import { z } from 'zod';
import {
  FEEDBACK_API_PATH, FeedbackCountsSchema, GenerationFeedbackSchema, JokeSampleSchema, SAMPLES_API_PATH,
  type FeedbackCounts, type FeedbackUpsertInput, type GenerationFeedback, type JokeSample, type SampleCreate, type SampleUpdate,
} from '@/lib/tasteProfile';

/** A Firebase `User` satisfies this. */
export type TokenSource = { getIdToken(): Promise<string> };

/** Non-OK response or unexpected body. `code` is the server's error code when it sent one. */
export class TasteRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = 'TasteRequestError';
  }
}

const FeedbackPageSchema = z.object({ feedback: z.array(GenerationFeedbackSchema), counts: FeedbackCountsSchema });
const FeedbackResultSchema = z.object({ feedback: GenerationFeedbackSchema.nullable() });
const ClearResultSchema = z.object({ deleted: z.number().int().min(0) });
const SamplesSchema = z.object({ samples: z.array(JokeSampleSchema) });
const CreateResultSchema = z.object({ sample: JokeSampleSchema, created: z.boolean() });
const SampleResultSchema = z.object({ sample: JokeSampleSchema });
const DeleteResultSchema = z.object({ deleted: z.boolean() });

async function request<T>(auth: TokenSource, method: string, url: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
  const token = await auth.getIdToken();
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const { error, code } = (payload ?? {}) as { error?: unknown; code?: unknown };
    throw new TasteRequestError(
      typeof error === 'string' && error ? error : `Request failed (${response.status})`,
      response.status,
      typeof code === 'string' ? code : undefined,
    );
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new TasteRequestError('Unexpected response from the server.', response.status, 'INVALID_RESPONSE');
  return parsed.data;
}

export async function listFeedback(auth: TokenSource, limit?: number): Promise<{ feedback: GenerationFeedback[]; counts: FeedbackCounts }> {
  const url = limit === undefined ? FEEDBACK_API_PATH : `${FEEDBACK_API_PATH}?limit=${encodeURIComponent(String(limit))}`;
  return request(auth, 'GET', url, FeedbackPageSchema);
}

/** Null when the merge left nothing to keep and the record was deleted. */
export async function setFeedback(auth: TokenSource, input: FeedbackUpsertInput): Promise<GenerationFeedback | null> {
  return (await request(auth, 'POST', FEEDBACK_API_PATH, FeedbackResultSchema, input)).feedback;
}

export async function clearFeedback(auth: TokenSource): Promise<number> {
  return (await request(auth, 'DELETE', FEEDBACK_API_PATH, ClearResultSchema)).deleted;
}

export async function listSamples(auth: TokenSource): Promise<JokeSample[]> {
  return (await request(auth, 'GET', SAMPLES_API_PATH, SamplesSchema)).samples;
}

/** Throws TasteRequestError with code `SAMPLE_LIMIT` at the cap. */
export async function createSample(auth: TokenSource, input: SampleCreate): Promise<{ sample: JokeSample; created: boolean }> {
  return request(auth, 'POST', SAMPLES_API_PATH, CreateResultSchema, input);
}

/** Throws TasteRequestError with code `NOT_FOUND` when the sample no longer exists. */
export async function updateSample(auth: TokenSource, input: SampleUpdate): Promise<JokeSample> {
  return (await request(auth, 'PATCH', SAMPLES_API_PATH, SampleResultSchema, input)).sample;
}

export async function deleteSample(auth: TokenSource, id: string): Promise<boolean> {
  return (await request(auth, 'DELETE', `${SAMPLES_API_PATH}?id=${encodeURIComponent(id)}`, DeleteResultSchema)).deleted;
}
