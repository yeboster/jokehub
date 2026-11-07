import { z } from 'zod';
import { JokeVariationSchema, isNearDuplicateJoke, normalizeJokeKey, type JokeVariation } from '@/lib/jokeGenerationContract';
import { lintJoke } from './joke-lint';

export { JokeVariationSchema, type JokeVariation };
/** Internal candidate: `hinge` and `mechanism` are planning fields, never public output. */
export type Candidate = JokeVariation & { hinge?: string; mechanism?: string };

/** Points subtracted from the critic score per automatic check failure. */
export const LINT_PENALTY = 2;
const adjustedScore = (ranking: CriticRanking, candidate: Candidate) =>
  ranking.score - LINT_PENALTY * lintJoke(candidate.jokeText, candidate.hinge).length;

const descriptor = z.string().trim().min(1).max(80).refine(text => !!normalizeJokeKey(text));
/** One valid critic row. The index range is checked against the candidate count separately. */
export const CriticRankingSchema = z.object({
  index: z.number().int().min(0),
  score: z.number().finite().min(1).max(10),
  reason: z.string().trim().min(1).max(500),
  safeForGeneralAudience: z.boolean(),
  fitsRequest: z.boolean(),
  original: z.boolean(),
  premiseKey: descriptor,
  mechanismKey: descriptor,
});
/**
 * Shape requested from the model. Deliberately loose: Genkit rejects output
 * that fails this schema, so per-row rules are applied by parseCriticRankings.
 */
export const CriticModelOutputSchema = z.object({
  rankings: z.array(z.object({
    index: z.number(),
    score: z.number(),
    reason: z.string(),
    safeForGeneralAudience: z.boolean(),
    fitsRequest: z.boolean(),
    original: z.boolean(),
    premiseKey: z.string(),
    mechanismKey: z.string(),
  })),
});
export type CriticRanking = z.infer<typeof CriticRankingSchema>;
/** Valid rankings with unique in-range indices; candidates without a row are unranked. */
export type CriticOutput = { rankings: CriticRanking[] };

/**
 * Tolerant critic parsing: invalid, out-of-range and duplicate rows are
 * dropped (first valid row per index wins). Null when no row is valid.
 */
export function parseCriticRankings(output: unknown, candidateCount: number): CriticOutput | null {
  const rows = (output as { rankings?: unknown } | null)?.rankings;
  if (!Array.isArray(rows)) return null;
  const byIndex = new Map<number, CriticRanking>();
  for (const row of rows) {
    const parsed = CriticRankingSchema.safeParse(row);
    if (!parsed.success || parsed.data.index >= candidateCount || byIndex.has(parsed.data.index)) continue;
    byIndex.set(parsed.data.index, parsed.data);
  }
  return byIndex.size ? { rankings: [...byIndex.values()] } : null;
}

export type JokeSelection = {
  jokes: JokeVariation[];
  objective: number;
  scoreSum: number;
  premiseCount: number;
  mechanismCount: number;
  indices: number[];
};

/** Positive means left wins; a fuller selection wins first. Same comparator governs baseline versus repair. */
export function compareSelections(left: JokeSelection, right: JokeSelection): number {
  const sizeDelta = left.indices.length - right.indices.length;
  if (sizeDelta !== 0) return sizeDelta;
  for (const field of ['objective', 'scoreSum', 'premiseCount', 'mechanismCount'] as const) {
    const delta = left[field] - right[field];
    if (delta !== 0) return delta;
  }
  for (let i = 0; i < left.indices.length; i++) {
    const delta = right.indices[i] - left.indices[i];
    if (delta !== 0) return delta;
  }
  return 0;
}

function* combinations<T>(items: readonly T[], size: number, start = 0, prefix: T[] = []): Generator<T[]> {
  if (prefix.length === size) { yield prefix; return; }
  for (let i = start; i <= items.length - (size - prefix.length); i++) {
    yield* combinations(items, size, i + 1, [...prefix, items[i]]);
  }
}

/**
 * Best eligible subset of size min(count, eligible unique jokes). Objective:
 * lint-adjusted score sum minus 2 per repeated premise and 1 per repeated
 * mechanism within the subset. Null only when no candidate is eligible.
 */
export function selectJokes<T extends Candidate>(
  candidates: readonly T[],
  verdict: CriticOutput,
  referenceTexts: readonly string[],
  libraryTexts: readonly string[] = [],
  count = 3,
): JokeSelection | null {
  const referenceKeys = new Set(referenceTexts.map(normalizeJokeKey));
  const eligible = verdict.rankings
    .filter(r => {
      const candidate = candidates[r.index];
      return r.safeForGeneralAudience && r.fitsRequest && r.original
        && JokeVariationSchema.safeParse(candidate).success
        && !referenceKeys.has(normalizeJokeKey(candidate.jokeText))
        && !libraryTexts.some(text => isNearDuplicateJoke(candidate.jokeText, text));
    })
    .sort((a, b) => a.index - b.index);
  const score = new Map(eligible.map(r => [r.index, adjustedScore(r, candidates[r.index])]));
  const size = Math.min(Math.max(1, Math.floor(count)), new Set(eligible.map(r => normalizeJokeKey(candidates[r.index].jokeText))).size);
  if (size === 0) return null;
  let best: JokeSelection | null = null;
  for (const subset of combinations(eligible, size)) {
    if (new Set(subset.map(r => normalizeJokeKey(candidates[r.index].jokeText))).size !== size) continue;
    const scoreSum = subset.reduce((sum, r) => sum + score.get(r.index)!, 0);
    const premiseCount = new Set(subset.map(r => normalizeJokeKey(r.premiseKey))).size;
    const mechanismCount = new Set(subset.map(r => normalizeJokeKey(r.mechanismKey))).size;
    const selection: JokeSelection = {
      objective: scoreSum - 2 * (size - premiseCount) - (size - mechanismCount),
      scoreSum, premiseCount, mechanismCount,
      indices: subset.map(r => r.index),
      jokes: [...subset].sort((x, y) => score.get(y.index)! - score.get(x.index)! || x.index - y.index).map(r => candidates[r.index]),
    };
    if (!best || compareSelections(selection, best) > 0) best = selection;
  }
  return best;
}

/** Bounded feedback for ranked candidates; categories/context are not redundantly copied. */
export function repairFeedback(candidates: readonly Candidate[], verdict: CriticOutput, referenceTexts: readonly string[]) {
  const referenceKeys = new Set(referenceTexts.map(normalizeJokeKey));
  const keys = candidates.map(c => normalizeJokeKey(c.jokeText));
  return [...verdict.rankings].sort((a, b) => a.index - b.index).map(r => {
    const duplicateCandidate = keys.some((key, index) => index !== r.index && key === keys[r.index]);
    const referenceCopy = referenceKeys.has(keys[r.index]);
    const duplicateFailure = referenceCopy && duplicateCandidate ? 'candidate-and-reference'
      : referenceCopy ? 'reference-copy' : duplicateCandidate ? 'candidate-duplicate' : 'none';
    const lintIssues = lintJoke(candidates[r.index].jokeText, candidates[r.index].hinge);
    return { ...r, jokeText: candidates[r.index].jokeText, duplicateFailure, lintIssues, adjustedScore: r.score - LINT_PENALTY * lintIssues.length };
  });
}

export function hasRepairTrigger(candidates: readonly Candidate[], verdict: CriticOutput, referenceTexts: readonly string[]): boolean {
  return verdict.rankings.length < candidates.length || repairFeedback(candidates, verdict, referenceTexts).some(r =>
    !r.safeForGeneralAudience || !r.fitsRequest || !r.original || r.adjustedScore <= 4 || r.duplicateFailure !== 'none');
}
