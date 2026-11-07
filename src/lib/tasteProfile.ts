/**
 * Shared contract for per-user generation feedback (👍/👎/saved) and joke
 * samples. Client-safe: no Node or Firebase imports. Storage lives in
 * `src/services/server/tasteStore.ts`; HTTP in `/api/generated-joke-feedback`
 * (existing route, extended) and `/api/joke-samples`.
 *
 * Feedback reuses the existing `generatedJokeFeedback` collection: one
 * document per user and normalized joke text, id `${uid}_${textHash}`.
 * `GenerationFeedback.id` is that `textHash`.
 */
import { z } from 'zod';
import { JOKE_GENERATION_LIMITS, JOKE_MODES, JokeTextSchema } from '@/lib/jokeGenerationContract';

export const FEEDBACK_API_PATH = '/api/generated-joke-feedback';
export const SAMPLES_API_PATH = '/api/joke-samples';

export const TASTE_LIMITS = {
  maxSamples: 50,
  feedbackPage: 100,
  reasonChars: JOKE_GENERATION_LIMITS.tasteReasonChars,
  noteChars: 200,
  categoryChars: 100,
  modelChars: 100,
} as const;

/** Deterministic document id: first 32 hex chars of sha256(normalizeJokeKey(text)). */
export const TasteDocIdSchema = z.string().regex(/^[a-f0-9]{32}$/);

export const FeedbackVoteSchema = z.enum(['up', 'down']);
export type FeedbackVote = z.infer<typeof FeedbackVoteSchema>;

/**
 * `vote`: undefined leaves the stored vote unchanged; null or the legacy
 * `'none'` clears it (normalized to null). `saved`: undefined leaves it
 * unchanged. A record left with no vote and `saved === false` is deleted.
 * `mode`/`requestId` are accepted for compatibility with the existing
 * thumbs-up/down client.
 */
export const FeedbackUpsertSchema = z.object({
  jokeText: JokeTextSchema,
  category: z.string().trim().max(TASTE_LIMITS.categoryChars).optional(),
  vote: z.enum(['up', 'down', 'none']).nullable().optional()
    .transform(vote => (vote === 'none' ? null : vote)),
  reason: z.string().trim().max(TASTE_LIMITS.reasonChars).nullable().optional(),
  saved: z.boolean().optional(),
  topicHint: z.string().max(JOKE_GENERATION_LIMITS.topicHintChars).optional(),
  model: z.string().max(TASTE_LIMITS.modelChars).optional(),
  mode: z.enum(JOKE_MODES).optional(),
  requestId: z.string().max(100).optional(),
});
export type FeedbackUpsert = z.infer<typeof FeedbackUpsertSchema>;
export type FeedbackUpsertInput = z.input<typeof FeedbackUpsertSchema>;

export const GenerationFeedbackSchema = z.object({
  id: TasteDocIdSchema,
  jokeText: z.string(),
  category: z.string().optional(),
  vote: FeedbackVoteSchema.nullable(),
  reason: z.string().optional(),
  saved: z.boolean(),
  topicHint: z.string().optional(),
  model: z.string().optional(),
  updatedAt: z.string(),
});
export type GenerationFeedback = z.infer<typeof GenerationFeedbackSchema>;

export const FeedbackCountsSchema = z.object({ liked: z.number().int().min(0), disliked: z.number().int().min(0) });
export type FeedbackCounts = z.infer<typeof FeedbackCountsSchema>;

export const SampleCreateSchema = z.object({
  text: JokeTextSchema,
  note: z.string().trim().max(TASTE_LIMITS.noteChars).optional(),
});
export type SampleCreate = z.infer<typeof SampleCreateSchema>;

export const SampleUpdateSchema = z.object({
  id: TasteDocIdSchema,
  active: z.boolean().optional(),
  note: z.string().trim().max(TASTE_LIMITS.noteChars).nullable().optional(),
});
export type SampleUpdate = z.infer<typeof SampleUpdateSchema>;

export const JokeSampleSchema = z.object({
  id: TasteDocIdSchema,
  text: z.string(),
  note: z.string().optional(),
  active: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type JokeSample = z.infer<typeof JokeSampleSchema>;

export type TasteExample = { text: string; reason?: string };

/** What the generator receives; capped by JOKE_GENERATION_LIMITS.taste*. */
export type TasteProfile = {
  samples: string[];
  liked: TasteExample[];
  disliked: TasteExample[];
};

export function emptyTasteProfile(): TasteProfile {
  return { samples: [], liked: [], disliked: [] };
}

export function isEmptyTasteProfile(profile: TasteProfile | undefined | null): boolean {
  return !profile || (profile.samples.length === 0 && profile.liked.length === 0 && profile.disliked.length === 0);
}
