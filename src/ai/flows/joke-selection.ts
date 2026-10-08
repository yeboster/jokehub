import { z } from 'zod';
import { JOKE_GENERATION_LIMITS, normalizeJokeKey } from '@/lib/jokeGenerationContract';

export const JokeVariationSchema = z.object({
  jokeText: z.string().max(JOKE_GENERATION_LIMITS.contextTextChars).refine(text => !!normalizeJokeKey(text)),
  category: z.string().refine(text => !!text.trim()),
});
export type JokeVariation = z.infer<typeof JokeVariationSchema>;

const descriptor = z.string().trim().min(1).max(80).refine(text => !!normalizeJokeKey(text));
const CriticRankingSchema = z.object({
  index: z.number().int().min(0).max(5),
  score: z.number().finite().min(1).max(10),
  reason: z.string().trim().min(1).max(500),
  safeForGeneralAudience: z.boolean(),
  fitsRequest: z.boolean(),
  original: z.boolean(),
  premiseKey: descriptor,
  mechanismKey: descriptor,
});
export const CriticOutputSchema = z.object({
  rankings: z.array(CriticRankingSchema).length(6).refine(
    rankings => new Set(rankings.map(r => r.index)).size === 6,
    'Every candidate index must occur exactly once.',
  ),
});
export type CriticRanking = z.infer<typeof CriticRankingSchema>;
export type CriticOutput = z.infer<typeof CriticOutputSchema>;

export type JokeSelection = {
  jokes: JokeVariation[];
  objective: number;
  scoreSum: number;
  premiseCount: number;
  mechanismCount: number;
  indices: number[];
};

/** Positive means left wins; same comparator governs baseline versus repair. */
export function compareSelections(left: JokeSelection, right: JokeSelection): number {
  for (const field of ['objective', 'scoreSum', 'premiseCount', 'mechanismCount'] as const) {
    const delta = left[field] - right[field];
    if (delta !== 0) return delta;
  }
  for (let i = 0; i < 3; i++) {
    const delta = right.indices[i] - left.indices[i];
    if (delta !== 0) return delta;
  }
  return 0;
}

export function selectJokes(
  candidates: readonly JokeVariation[],
  verdict: CriticOutput,
  referenceTexts: readonly string[],
): JokeSelection | null {
  const referenceKeys = new Set(referenceTexts.map(normalizeJokeKey));
  const eligible = verdict.rankings.filter(r => {
    const candidate = candidates[r.index];
    return r.safeForGeneralAudience && r.fitsRequest && r.original
      && JokeVariationSchema.safeParse(candidate).success
      && !referenceKeys.has(normalizeJokeKey(candidate.jokeText));
  });
  let best: JokeSelection | null = null;
  for (let a = 0; a < eligible.length - 2; a++) {
    for (let b = a + 1; b < eligible.length - 1; b++) {
      for (let c = b + 1; c < eligible.length; c++) {
        const triple = [eligible[a], eligible[b], eligible[c]];
        if (new Set(triple.map(r => normalizeJokeKey(candidates[r.index].jokeText))).size !== 3) continue;
        const scoreSum = triple.reduce((sum, r) => sum + r.score, 0);
        const premiseCount = new Set(triple.map(r => normalizeJokeKey(r.premiseKey))).size;
        const mechanismCount = new Set(triple.map(r => normalizeJokeKey(r.mechanismKey))).size;
        const selection: JokeSelection = {
          objective: scoreSum - 2 * (3 - premiseCount) - (3 - mechanismCount),
          scoreSum, premiseCount, mechanismCount,
          indices: triple.map(r => r.index).sort((x, y) => x - y),
          jokes: triple.sort((x, y) => y.score - x.score || x.index - y.index).map(r => candidates[r.index]),
        };
        if (!best || compareSelections(selection, best) > 0) best = selection;
      }
    }
  }
  return best;
}

/** Fixed-size feedback; categories/context are not redundantly copied. */
export function repairFeedback(candidates: readonly JokeVariation[], verdict: CriticOutput, referenceTexts: readonly string[]) {
  const referenceKeys = new Set(referenceTexts.map(normalizeJokeKey));
  const keys = candidates.map(c => normalizeJokeKey(c.jokeText));
  return [...verdict.rankings].sort((a, b) => a.index - b.index).map(r => {
    const duplicateCandidate = keys.some((key, index) => index !== r.index && key === keys[r.index]);
    const referenceCopy = referenceKeys.has(keys[r.index]);
    const duplicateFailure = referenceCopy && duplicateCandidate ? 'candidate-and-reference'
      : referenceCopy ? 'reference-copy' : duplicateCandidate ? 'candidate-duplicate' : 'none';
    return { ...r, jokeText: candidates[r.index].jokeText, duplicateFailure };
  });
}

export function hasRepairTrigger(candidates: readonly JokeVariation[], verdict: CriticOutput, referenceTexts: readonly string[]): boolean {
  return repairFeedback(candidates, verdict, referenceTexts).some(r =>
    !r.safeForGeneralAudience || !r.fitsRequest || !r.original || r.score <= 4 || r.duplicateFailure !== 'none');
}
