// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GenerateJokeInput, GenerateJokeOutput } from './generate-joke-flow';

const aiMock = vi.hoisted(() => ({
  generate: vi.fn(),
  defineFlow: vi.fn((
    config: {
      name: string;
      inputSchema: { safeParse: (value: unknown) => { success: boolean } };
      outputSchema: { safeParse: (value: unknown) => { success: boolean } };
    },
    handler: (input: GenerateJokeInput) => Promise<GenerateJokeOutput>,
  ) => handler),
}));

vi.mock('@/ai/ai-instance', () => ({ ai: aiMock }));

import { generateJoke } from './generate-joke-flow';
import { DEFAULT_GENERATE_MODEL, GEMINI_MODELS } from '@/ai/models';
import {
  CLICHE_BLACKLIST,
  CRAFT_PRINCIPLES,
  jokeGenerationPrompt,
  systemInstruction,
} from '@/ai/prompts/generate-joke-prompt';

const candidates = Array.from({ length: 6 }, (_, index) => ({
  jokeText: `Candidate ${index}`,
  category: 'Observational',
}));
const rankings = (scores: number[]) => ({
  rankings: scores.map((score, index) => ({ index, score, reason: 'Fixture score' })),
});

describe('generateJoke flow contracts', () => {
  beforeEach(() => {
    aiMock.generate.mockReset();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    [{}, DEFAULT_GENERATE_MODEL, 1.1],
    [{ model: GEMINI_MODELS[0], temperature: 0 }, GEMINI_MODELS[0], 0],
    [{ model: GEMINI_MODELS[2], temperature: 2 }, GEMINI_MODELS[2], 2],
  ] as const)('keeps two calls, selected/default model and temperature for %j', async (options, model, temperature) => {
    const input = {
      ...options,
      topicHint: 'trains in Italian',
      prefilledJokes: ['Existing train joke'],
      exemplarJokes: ['Train style example'],
    };
    aiMock.generate
      .mockResolvedValueOnce({ output: { jokes: candidates } })
      .mockResolvedValueOnce({ output: rankings([2, 9, 4, 8, 3, 7]) });

    const result = await generateJoke(input);

    expect(result).toEqual({ jokes: [candidates[1], candidates[3], candidates[5]] });
    expect(aiMock.generate).toHaveBeenCalledTimes(2);
    const [generator] = aiMock.generate.mock.calls[0];
    const [critic] = aiMock.generate.mock.calls[1];
    expect(generator).toMatchObject({
      model,
      config: { temperature },
      system: systemInstruction,
      prompt: jokeGenerationPrompt(input.topicHint, input.prefilledJokes, input.exemplarJokes, 6),
    });
    expect(critic).toMatchObject({ model, config: { temperature: 0.2 } });
    expect(critic.system).toContain(CRAFT_PRINCIPLES);
    expect(critic.system).toContain(CLICHE_BLACKLIST);
    for (const context of [...input.prefilledJokes, ...input.exemplarJokes]) {
      expect(generator.prompt).toContain(context);
      expect(critic.prompt).toContain(context);
    }
    for (const [index, candidate] of candidates.entries()) {
      expect(critic.prompt).toContain(`[${index}] (category: ${candidate.category}) ${candidate.jokeText}`);
    }
    expect(generator.output.schema.safeParse({ jokes: candidates }).success).toBe(true);
    expect(generator.output.schema.safeParse({ jokes: candidates.slice(0, 3) }).success).toBe(false);
    expect(critic.output.schema.safeParse(rankings([1, 2, 3, 4, 5, 6])).success).toBe(true);
    expect(critic.output.schema.safeParse(rankings([1, 2, 3])).success).toBe(false);
  });

  it('captures public schemas without claiming callback mocks validate inputs', () => {
    const [config] = aiMock.defineFlow.mock.calls[0];
    expect(config.name).toBe('generateJokeFlow');
    expect(config.inputSchema.safeParse({}).success).toBe(true);
    expect(config.inputSchema.safeParse({ model: GEMINI_MODELS[0], temperature: 0, exemplarJokes: Array(10).fill('Example') }).success).toBe(true);
    for (const invalid of [
      { model: 'unsupported' },
      { temperature: -0.1 },
      { temperature: 2.1 },
      { exemplarJokes: Array(11).fill('Example') },
    ]) {
      expect(config.inputSchema.safeParse(invalid).success).toBe(false);
    }
    expect(config.outputSchema.safeParse({ jokes: candidates.slice(0, 3) }).success).toBe(true);
    expect(config.outputSchema.safeParse({ jokes: candidates }).success).toBe(false);
  });

  it('retains candidate order for tied ordered rankings', async () => {
    aiMock.generate
      .mockResolvedValueOnce({ output: { jokes: candidates } })
      .mockResolvedValueOnce({ output: rankings([7, 7, 7, 7, 7, 7]) });
    await expect(generateJoke({})).resolves.toEqual({ jokes: candidates.slice(0, 3) });
    expect(aiMock.generate).toHaveBeenCalledTimes(2);
  });

  it('surfaces generator errors without calling critic', async () => {
    const error = new Error('Generator unavailable');
    aiMock.generate.mockRejectedValueOnce(error);
    await expect(generateJoke({})).rejects.toBe(error);
    expect(aiMock.generate).toHaveBeenCalledTimes(1);
  });

  it.each([
    [null, 'AI failed to generate joke candidates. The output was empty.'],
    ['not an object', 'AI failed to generate joke candidates. The output was empty.'],
    [{ jokes: candidates.slice(0, 3) }, 'AI returned candidate data in an unexpected format.'],
    [{ jokes: candidates.map(() => ({ jokeText: 42, category: 'Work' })) }, 'AI returned candidate data in an unexpected format.'],
  ])('rejects invalid candidate output %j without calling critic', async (output, message) => {
    aiMock.generate.mockResolvedValueOnce({ output });
    await expect(generateJoke({})).rejects.toThrow(message as string);
    expect(aiMock.generate).toHaveBeenCalledTimes(1);
  });

  it.each([
    null,
    'not an object',
    rankings([1, 2, 3]),
    rankings([0, 2, 3, 4, 5, 6]),
  ])('falls back to first three on invalid critic output %j', async (output) => {
    aiMock.generate
      .mockResolvedValueOnce({ output: { jokes: candidates } })
      .mockResolvedValueOnce({ output });
    await expect(generateJoke({})).resolves.toEqual({ jokes: candidates.slice(0, 3) });
    expect(aiMock.generate).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it('falls back to first three when critic throws', async () => {
    aiMock.generate
      .mockResolvedValueOnce({ output: { jokes: candidates } })
      .mockRejectedValueOnce(new Error('Critic unavailable'));
    await expect(generateJoke({})).resolves.toEqual({ jokes: candidates.slice(0, 3) });
    expect(aiMock.generate).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledOnce();
  });
});
