/**
 * @fileOverview AI flow for generating jokes.
 *
 * Strategy (T6): generate-and-rerank.
 *   1. Generate SIX diverse candidates at a temperature biased for variety.
 *   2. Run a single critic pass that scores each on surprise/incongruity,
 *      originality vs the exemplars AND prefilledJokes, setup-punchline
 *      economy, and absence of clichés.
 *   3. Return the TOP 3 candidates ranked by critic score.
 *
 * If the critic call fails or returns invalid output, fall back to the
 * first 3 candidates and log a warning (never throw on rerank failure).
 *
 * - generateJoke    — exported function (stable signature).
 * - GenerateJokeInput / GenerateJokeOutput — stable public types.
 */

import { ai } from '@/ai/ai-instance';
import {
  jokeGenerationPrompt,
  systemInstruction,
  CRAFT_PRINCIPLES,
  CLICHE_BLACKLIST,
} from '@/ai/prompts/generate-joke-prompt';
import { DEFAULT_GENERATE_MODEL, GEMINI_MODELS } from '@/ai/models';
import { z } from 'genkit';

/** Number of candidates generated before the rerank pass. */
const CANDIDATE_COUNT = 6;

/** Number of top candidates returned to the caller. */
const TOP_N = 3;

/** Default temperature biased toward diverse candidates. */
const DEFAULT_TEMPERATURE = 1.1;

const GenerateJokeInputSchema = z.object({
  topicHint: z.string().optional().describe('An optional topic or category hint for the joke.'),
  prefilledJokes: z.array(z.string()).optional().describe('A list of prefilled jokes to ensure the generated jokes are different.'),
  /**
   * Up to 5 highly-rated existing jokes used as STYLE exemplars. The
   * model is instructed to match their comedic voice and craft, but not
   * copy topics or structures.
   */
  exemplarJokes: z.array(z.string()).max(5).optional().describe('Up to 5 highly-rated existing jokes used as style exemplars.'),
  model: z.enum(GEMINI_MODELS).optional().describe('The model to use for generation.'),
  temperature: z.number().min(0).max(2).optional().describe('Controls the randomness of the output. Higher values (e.g., 1.5) are more creative, lower values (e.g., 0.2) are more predictable.'),
});

export type GenerateJokeInput = z.infer<typeof GenerateJokeInputSchema>;

const JokeObjectSchema = z.object({
  jokeText: z.string().describe('The generated joke, including setup and punchline.'),
  category: z.string().describe('A suggested category for the joke (e.g., Animals, Puns, Work).'),
});

/** Internal: holds the full candidate set returned by the generator. */
const GenerateCandidatesOutputSchema = z.object({
  jokes: z.array(JokeObjectSchema).length(CANDIDATE_COUNT).describe(`Exactly ${CANDIDATE_COUNT} joke candidates for the critic pass.`),
});

/** Internal: the critic's verdict on each candidate. */
const CriticRankingSchema = z.object({
  index: z.number().int().min(0).max(CANDIDATE_COUNT - 1).describe('Zero-based index of the candidate being scored.'),
  score: z.number().min(1).max(10).describe('Quality score from 1 (weak) to 10 (excellent).'),
  reason: z.string().describe('One short sentence explaining the score.'),
});

const CriticOutputSchema = z.object({
  rankings: z.array(CriticRankingSchema).length(CANDIDATE_COUNT).describe(`Exactly ${CANDIDATE_COUNT} rankings, one per candidate, in order.`),
});

const GenerateJokeOutputSchema = z.object({
  jokes: z.array(JokeObjectSchema).length(TOP_N).describe(`The top ${TOP_N} jokes, ranked by the critic.`),
});
export type GenerateJokeOutput = z.infer<typeof GenerateJokeOutputSchema>;
export type JokeVariation = z.infer<typeof JokeObjectSchema>;

export async function generateJoke(input: GenerateJokeInput): Promise<GenerateJokeOutput> {
  return generateJokeFlow(input);
}

/**
 * Stable system instruction — used for both the candidate generator and
 * the critic. The critic prompt below prepends a sharper "critic voice"
 * on top of the shared principles.
 */
const criticSystemInstruction = `You are a sharp, opinionated comedy critic. You score jokes on a 1–10 scale using these criteria, in this order of weight:

1. Surprise / incongruity — does the punchline subvert the setup?
2. Originality — is it meaningfully different from the provided prefilled jokes AND community-rated exemplars? Penalize near-duplicates, recycled premises, or cliché formats.
3. Setup-punchline economy — is the joke tight, with no wasted words? Does the punchline land on the final word or final beat?
4. Cliché avoidance — flag any reliance on the cliché blacklist (chicken-crossing-road, knock-knock, walks-into-a-bar, AI self-puns, "[noun] is just a [noun]" definitions).

${CRAFT_PRINCIPLES}

${CLICHE_BLACKLIST}

Score every candidate on its own merits. Be discriminating: a 7 is a genuinely funny joke, a 9+ is memorable, a 5 is mediocre, ≤4 is weak. Do not inflate scores — most candidate sets should NOT produce a 10.`;

/**
 * Build the critic's user prompt: candidate list + anti-dup context.
 */
const criticPrompt = (
  candidates: Array<{ jokeText: string; category: string }>,
  prefilledJokes: string[] | undefined,
  exemplarJokes: string[] | undefined,
): string => {
  const candidateBlock = candidates
    .map((c, i) => `[${i}] (category: ${c.category}) ${c.jokeText}`)
    .join('\n\n');

  let prompt = `Score each of the ${candidates.length} candidate jokes below on a 1–10 scale. Return one ranking per candidate in order.\n\nCandidates:\n${candidateBlock}`;

  if ((prefilledJokes && prefilledJokes.length) || (exemplarJokes && exemplarJokes.length)) {
    prompt += `\n\nContext for the originality criterion (do NOT echo these):`;
    if (prefilledJokes && prefilledJokes.length) {
      prompt += `\n\nAlready-present jokes to differ from:\n${prefilledJokes.map(j => `- "${j}"`).join('\n')}`;
    }
    if (exemplarJokes && exemplarJokes.length) {
      prompt += `\n\nCommunity 5-star exemplars (style reference only — must not be copied):\n${exemplarJokes.map(j => `- "${j}"`).join('\n')}`;
    }
  }

  prompt += `\n\nReturn exactly ${candidates.length} rankings, one per candidate in index order.`;
  return prompt;
};

const generateJokeFlow = ai.defineFlow(
  {
    name: 'generateJokeFlow',
    inputSchema: GenerateJokeInputSchema,
    outputSchema: GenerateJokeOutputSchema,
  },
  async (input) => {
    const model = input.model || DEFAULT_GENERATE_MODEL;
    const temperature = input.temperature ?? DEFAULT_TEMPERATURE;

    // --- Step 1: generate CANDIDATE_COUNT candidates ---
    const candidatePrompt = jokeGenerationPrompt(
      input.topicHint,
      input.prefilledJokes,
      input.exemplarJokes,
      CANDIDATE_COUNT,
    );

    const candidateRes = await ai.generate({
      prompt: candidatePrompt,
      model,
      system: systemInstruction,
      output: { schema: GenerateCandidatesOutputSchema },
      config: { temperature },
    });

    const candidateOutput = candidateRes.output;
    if (!candidateOutput || typeof candidateOutput !== 'object') {
      throw new Error('AI failed to generate joke candidates. The output was empty.');
    }
    const parsedCandidates = GenerateCandidatesOutputSchema.safeParse(candidateOutput);
    if (!parsedCandidates.success) {
      console.error('AI candidate output validation error:', parsedCandidates.error);
      throw new Error('AI returned candidate data in an unexpected format.');
    }

    const candidates = parsedCandidates.data.jokes;

    // --- Step 2: critic pass to rank the candidates ---
    let rankedIndices: number[] | null = null;
    try {
      const criticRes = await ai.generate({
        prompt: criticPrompt(candidates, input.prefilledJokes, input.exemplarJokes),
        model,
        system: criticSystemInstruction,
        output: { schema: CriticOutputSchema },
        config: {
          // Lower temperature so the critic is deterministic / focused.
          temperature: 0.2,
        },
      });

      const criticOutput = criticRes.output;
      if (criticOutput && typeof criticOutput === 'object') {
        const parsedCritic = CriticOutputSchema.safeParse(criticOutput);
        if (parsedCritic.success) {
          // Stable sort: descending score, then original index to keep order deterministic.
          const indices = parsedCritic.data.rankings
            .map((r, originalIndex) => ({ originalIndex, score: r.score }))
            .sort((a, b) => {
              if (b.score !== a.score) return b.score - a.score;
              return a.originalIndex - b.originalIndex;
            })
            .map((r) => r.originalIndex);

          rankedIndices = indices;
        } else {
          console.warn('[generateJokeFlow] Critic output failed schema validation; falling back to first 3 candidates.', parsedCritic.error);
        }
      } else {
        console.warn('[generateJokeFlow] Critic returned empty output; falling back to first 3 candidates.');
      }
    } catch (criticError) {
      // Never let a critic failure kill the whole flow — fall back gracefully.
      console.warn('[generateJokeFlow] Critic pass threw; falling back to first 3 candidates.', criticError);
    }

    // --- Step 3: pick the top TOP_N candidates ---
    const chosen = (rankedIndices ?? candidates.map((_, i) => i))
      .slice(0, TOP_N)
      .map((i) => candidates[i]);

    return { jokes: chosen };
  }
);
