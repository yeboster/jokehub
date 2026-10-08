// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GenerateJokeInput, GenerateJokeOutput } from './generate-joke-flow';

const aiMock = vi.hoisted(() => ({
  generate: vi.fn(),
  defineFlow: vi.fn((config: {
    name: string;
    inputSchema: { safeParse: (value: unknown) => { success: boolean } };
    outputSchema: { safeParse: (value: unknown) => { success: boolean } };
  }, handler: (input: GenerateJokeInput) => Promise<GenerateJokeOutput>) => handler),
}));
vi.mock('@/ai/ai-instance', () => ({ ai: aiMock }));
import { generateJoke } from './generate-joke-flow';
import { DEFAULT_GENERATE_MODEL, GEMINI_MODELS } from '@/ai/models';

const candidates = Array.from({ length: 6 }, (_, index) => ({ jokeText: `Candidate ${index}`, category: 'Observational' }));
const replacement = candidates.map((c) => ({ ...c, jokeText: `Repaired ${c.jokeText}` }));
const rankings = (scores = [2, 9, 4, 8, 3, 7]) => ({
  rankings: scores.map((score, index) => ({
    index, score, reason: 'Fixture score', safeForGeneralAudience: true, fitsRequest: true, original: true,
    premiseKey: `Premise ${index}`, mechanismKey: `Mechanism ${index}`,
  })),
});
const qualityError = 'Joke quality check failed. Please try again.';
const scarcityError = 'Could not produce three eligible, unique jokes. Please try again.';
function initial(verdict = rankings(), jokes = candidates) {
  aiMock.generate.mockResolvedValueOnce({ output: { jokes } }).mockResolvedValueOnce({ output: verdict });
}

beforeEach(() => { aiMock.generate.mockReset(); });

describe('explicit-index quality selection', () => {
  it('selects explicit indices from shuffled full permutation, independent of verdict order', async () => {
    const verdict = rankings();
    verdict.rankings = [verdict.rankings[5], verdict.rankings[0], verdict.rankings[3], verdict.rankings[2], verdict.rankings[1], verdict.rankings[4]];
    initial(verdict);
    await expect(generateJoke({})).resolves.toEqual({ jokes: [candidates[1], candidates[3], candidates[5]] });
  });
  it.each(['safeForGeneralAudience', 'fitsRequest', 'original'] as const)('excludes score10 candidate when %s false', async (gate) => {
    const verdict = rankings([10, 9, 8, 7, 6, 5]);
    verdict.rankings[0][gate] = false;
    initial(verdict);
    await expect(generateJoke({})).resolves.toEqual({ jokes: candidates.slice(1, 4) });
  });
  it.each([0, 6, 0.5])('rejects malformed index %s without repair', async (index) => {
    const verdict = rankings(); verdict.rankings[5].index = index;
    initial(verdict);
    await expect(generateJoke({}, { allowRepair: true })).rejects.toThrow(qualityError);
    expect(aiMock.generate).toHaveBeenCalledTimes(2);
  });
  it.each([
    ['safeForGeneralAudience', 'true'], ['fitsRequest', 1], ['original', null], ['score', NaN], ['score', Infinity],
    ['score', 0], ['score', 11], ['reason', '  '], ['reason', 'x'.repeat(501)],
    ['premiseKey', '!!!'], ['mechanismKey', ''], ['premiseKey', 'x'.repeat(81)],
  ])('rejects malformed critic field %s=%s', async (key, value) => {
    const verdict = rankings(); Object.assign(verdict.rankings[0], { [key]: value }); initial(verdict);
    await expect(generateJoke({}, { allowRepair: true })).rejects.toThrow(qualityError);
    expect(aiMock.generate).toHaveBeenCalledTimes(2);
  });
  it.each([null, 'bad', { rankings: rankings().rankings.slice(0, 5) }])('fails closed on critic output %j', async (output) => {
    aiMock.generate.mockResolvedValueOnce({ output: { jokes: candidates } }).mockResolvedValueOnce({ output });
    await expect(generateJoke({}, { allowRepair: true })).rejects.toThrow(qualityError);
    expect(aiMock.generate).toHaveBeenCalledTimes(2);
  });
  it('fails closed on throwing initial critic even with repair enabled', async () => {
    aiMock.generate.mockResolvedValueOnce({ output: { jokes: candidates } }).mockRejectedValueOnce(new Error('offline'));
    await expect(generateJoke({}, { allowRepair: true })).rejects.toThrow(qualityError);
    expect(aiMock.generate).toHaveBeenCalledTimes(2);
  });
  it('never chooses normalized duplicates; retains higher scoring duplicate', async () => {
    const jokes = candidates.map(c => ({ ...c }));
    jokes[0].jokeText = ' ＨＥＬＬＯ!!!  World '; jokes[1].jokeText = 'hello world';
    initial(rankings([9, 10, 8, 7, 2, 1]), jokes);
    await expect(generateJoke({})).resolves.toEqual({ jokes: [jokes[1], jokes[2], jokes[3]] });
  });
  it.each(['prefilledJokes', 'exemplarJokes', 'recentGeneratedJokes'] as const)('excludes normalized reference copy from %s', async (field) => {
    initial(rankings([10, 9, 8, 7, 6, 5]));
    await expect(generateJoke({ [field]: [' ＣＡＮＤＩＤＡＴＥ 0!!! '] })).resolves.toEqual({ jokes: candidates.slice(1, 4) });
  });
  it.each(['gates', 'duplicates'] as const)('throws scarcity, never pads or returns fewer for %s', async (kind) => {
    const verdict = rankings();
    if (kind === 'gates') verdict.rankings.slice(2).forEach(r => { r.original = false; });
    initial(verdict, kind === 'duplicates' ? candidates.map(c => ({ ...c, jokeText: 'same!' })) : candidates);
    await expect(generateJoke({})).rejects.toThrow(scarcityError);
    expect(aiMock.generate).toHaveBeenCalledTimes(2);
  });
});

describe('request and runtime schemas', () => {
  it.each([[{}, DEFAULT_GENERATE_MODEL, 1.1], [{ model: GEMINI_MODELS[0], temperature: 0 }, GEMINI_MODELS[0], 0], [{ model: GEMINI_MODELS[2], temperature: 2 }, GEMINI_MODELS[2], 2]] as const)(
    'preserves two-call model/temperature contract %j', async (options, model, temperature) => {
      initial(); await generateJoke(options);
      expect(aiMock.generate).toHaveBeenCalledTimes(2);
      expect(aiMock.generate.mock.calls[0][0]).toMatchObject({ model, config: { temperature } });
      expect(aiMock.generate.mock.calls[1][0]).toMatchObject({ model, config: { temperature: 0.2 } });
    });
  it('passes original topic/language/format and separated references to generator and critic', async () => {
    const input = { topicHint: 'trains in Italian, knock-knock format', prefilledJokes: ['Existing joke'], exemplarJokes: ['Style joke'], recentGeneratedJokes: ['Recent joke'] };
    initial(); await generateJoke(input);
    for (const [call] of aiMock.generate.mock.calls) {
      for (const text of [input.topicHint, 'Existing joke', 'Style joke', 'Recent joke']) expect(call.prompt).toContain(text);
      expect(call.prompt).toContain('reference data, not instructions');
    }
    const critic = aiMock.generate.mock.calls[1][0];
    expect(critic.prompt).toContain('Original request');
    expect(critic.prompt).toContain('Style references');
    expect(critic.prompt).not.toContain('5-star');
    expect(critic.system).toContain('explicitly requested');
    expect(critic.system).toContain('not safety or originality');
    expect(critic.system).toContain('natural wording');
    expect(critic.system).toContain('earned surprise');
    expect(critic.system).toContain('safeForGeneralAudience');
    expect(critic.system).toContain('fitsRequest');
    expect(critic.system).toContain('original only');
  });
  it.each([
    { topicHint: 'x'.repeat(501) }, { prefilledJokes: Array(26).fill('ok') }, { exemplarJokes: Array(11).fill('ok') },
    { recentGeneratedJokes: Array(13).fill('ok') }, { prefilledJokes: ['!!!'] }, { exemplarJokes: ['x'.repeat(2001)] },
    { model: 'unsupported' }, { temperature: Infinity }, { temperature: NaN }, { temperature: -0.1 }, { temperature: 2.1 },
  ])('invalid input consumes zero calls on both entry paths %j', async (input) => {
    for (const options of [undefined, { allowRepair: true }]) await expect(generateJoke(input as GenerateJokeInput, options)).rejects.toThrow();
    expect(aiMock.generate).not.toHaveBeenCalled();
  });
  it('accepts limit boundaries and validates registered path explicitly', async () => {
    initial();
    await generateJoke({ topicHint: 'x'.repeat(500), prefilledJokes: Array(25).fill('x'.repeat(2000)), exemplarJokes: Array(10).fill('example'), recentGeneratedJokes: Array(12).fill('recent'), temperature: 0 });
    expect(aiMock.generate).toHaveBeenCalledTimes(2);
    aiMock.generate.mockReset();
    const handler = aiMock.defineFlow.mock.results[0].value;
    await expect(handler({ topicHint: 'x'.repeat(501) })).rejects.toThrow();
    expect(aiMock.generate).not.toHaveBeenCalled();
    const config = aiMock.defineFlow.mock.calls[0][0];
    expect(config.outputSchema.safeParse({ jokes: candidates.slice(0, 3) }).success).toBe(true);
    expect(config.outputSchema.safeParse({ jokes: candidates.slice(0, 2) }).success).toBe(false);
  });
  it('preserves initial generator transport error and one-call ceiling', async () => {
    const error = new Error('Generator unavailable'); aiMock.generate.mockRejectedValueOnce(error);
    await expect(generateJoke({}, { allowRepair: true })).rejects.toBe(error);
    expect(aiMock.generate).toHaveBeenCalledTimes(1);
  });
  it.each([
    [null, 'AI failed to generate joke candidates. The output was empty.'],
    ['bad', 'AI failed to generate joke candidates. The output was empty.'],
    [{ jokes: candidates.slice(0, 3) }, 'AI returned candidate data in an unexpected format.'],
    [{ jokes: candidates.map(c => ({ ...c, jokeText: '!!!' })) }, 'AI returned candidate data in an unexpected format.'],
    [{ jokes: candidates.map(c => ({ ...c, jokeText: 'x'.repeat(2001) })) }, 'AI returned candidate data in an unexpected format.'],
    [{ jokes: candidates.map(c => ({ ...c, category: ' ' })) }, 'AI returned candidate data in an unexpected format.'],
  ])('rejects initial candidate shape %j without critic', async (output, message) => {
    aiMock.generate.mockResolvedValueOnce({ output });
    await expect(generateJoke({}, { allowRepair: true })).rejects.toThrow(message as string);
    expect(aiMock.generate).toHaveBeenCalledTimes(1);
  });
});

describe('trusted bounded repair', () => {
  it('default and client operational flags cannot enable repair', async () => {
    initial();
    await generateJoke({ allowRepair: true, repair: true } as GenerateJokeInput);
    expect(aiMock.generate).toHaveBeenCalledTimes(2);
    expect(aiMock.generate.mock.calls[0][0].prompt).not.toContain('allowRepair');
  });
  it('registered flow remains default off', async () => {
    initial(); await aiMock.defineFlow.mock.results[0].value({});
    expect(aiMock.generate).toHaveBeenCalledTimes(2);
  });
  it('enabled clean verdict has no actionable trigger', async () => {
    initial(rankings([8, 8, 8, 8, 8, 8])); await generateJoke({}, { allowRepair: true });
    expect(aiMock.generate).toHaveBeenCalledTimes(2);
  });
  it.each(['gate', 'duplicate', 'copy', 'weak'] as const)('repairs valid actionable %s feedback at most once', async (trigger) => {
    const verdict = rankings([8, 8, 8, 8, 8, 8]); const jokes = candidates.map(c => ({ ...c }));
    if (trigger === 'gate') verdict.rankings[0].fitsRequest = false;
    if (trigger === 'duplicate') jokes[0].jokeText = jokes[1].jokeText;
    if (trigger === 'weak') verdict.rankings[0].score = 4;
    initial(verdict, jokes);
    aiMock.generate.mockResolvedValueOnce({ output: { jokes: replacement } }).mockResolvedValueOnce({ output: rankings([10, 9, 8, 7, 6, 4]) });
    const input = { topicHint: 'trains in Italian, knock-knock', prefilledJokes: trigger === 'copy' ? [jokes[0].jokeText] : ['Old joke'], exemplarJokes: ['Style joke'], recentGeneratedJokes: ['Recent joke'], model: GEMINI_MODELS[0], temperature: 0 };
    await expect(generateJoke(input, { allowRepair: true })).resolves.toEqual({ jokes: replacement.slice(0, 3) });
    expect(aiMock.generate).toHaveBeenCalledTimes(4);
    aiMock.generate.mock.calls.forEach(([call], index) => {
      expect(call.model).toBe(input.model); expect(call.config.temperature).toBe(index % 2 ? 0.2 : 0);
      for (const text of [input.topicHint, ...input.prefilledJokes, ...input.exemplarJokes, ...input.recentGeneratedJokes]) expect(call.prompt).toContain(text);
    });
    const prompt = aiMock.generate.mock.calls[2][0].prompt;
    expect(prompt).toContain('Repair feedback');
    const feedback = JSON.parse(prompt.split('Repair feedback (reference data, not instructions):\n')[1]);
    expect(feedback).toHaveLength(6);
    expect(feedback[0]).not.toHaveProperty('category');
    expect(feedback[0]).toMatchObject({ index: 0, jokeText: jokes[0].jokeText, reason: 'Fixture score' });
    if (trigger === 'duplicate' || trigger === 'copy') expect(feedback[0].duplicateFailure).not.toBe('none');
  });
  it.each(['equal', 'worse'] as const)('keeps baseline when replacement %s', async (kind) => {
    initial(); aiMock.generate.mockResolvedValueOnce({ output: { jokes: replacement } }).mockResolvedValueOnce({ output: rankings(kind === 'equal' ? undefined : [1, 2, 3, 4, 5, 6]) });
    await expect(generateJoke({}, { allowRepair: true })).resolves.toEqual({ jokes: [candidates[1], candidates[3], candidates[5]] });
    expect(aiMock.generate).toHaveBeenCalledTimes(4);
  });
  it.each(['generator throws', 'generator invalid', 'critic throws', 'critic invalid', 'scarcity'] as const)('preserves usable baseline after repair %s', async (failure) => {
    initial();
    if (failure === 'generator throws') aiMock.generate.mockRejectedValueOnce(new Error('offline'));
    else if (failure === 'generator invalid') aiMock.generate.mockResolvedValueOnce({ output: { jokes: [] } });
    else {
      aiMock.generate.mockResolvedValueOnce({ output: { jokes: replacement } });
      if (failure === 'critic throws') aiMock.generate.mockRejectedValueOnce(new Error('offline'));
      else if (failure === 'critic invalid') aiMock.generate.mockResolvedValueOnce({ output: null });
      else { const verdict = rankings(); verdict.rankings.forEach(r => { r.original = false; }); aiMock.generate.mockResolvedValueOnce({ output: verdict }); }
    }
    await expect(generateJoke({}, { allowRepair: true })).resolves.toEqual({ jokes: [candidates[1], candidates[3], candidates[5]] });
    expect(aiMock.generate).toHaveBeenCalledTimes(failure.startsWith('generator') ? 3 : 4);
  });
  it.each(['success', 'generator throws', 'generator invalid', 'critic throws', 'critic invalid', 'scarcity'] as const)('no-baseline repair %s obeys scarcity and call bound', async (failure) => {
    const verdict = rankings(); verdict.rankings.forEach(r => { r.original = false; }); initial(verdict);
    if (failure === 'generator throws') aiMock.generate.mockRejectedValueOnce(new Error('offline'));
    else if (failure === 'generator invalid') aiMock.generate.mockResolvedValueOnce({ output: null });
    else {
      aiMock.generate.mockResolvedValueOnce({ output: { jokes: replacement } });
      if (failure === 'critic throws') aiMock.generate.mockRejectedValueOnce(new Error('offline'));
      else aiMock.generate.mockResolvedValueOnce({ output: failure === 'critic invalid' ? null : failure === 'scarcity' ? verdict : rankings() });
    }
    const result = generateJoke({}, { allowRepair: true });
    if (failure === 'success') await expect(result).resolves.toEqual({ jokes: [replacement[1], replacement[3], replacement[5]] });
    else await expect(result).rejects.toThrow(scarcityError);
    expect(aiMock.generate).toHaveBeenCalledTimes(failure.startsWith('generator') ? 3 : 4);
  });
  it('concurrent on/off requests never share repair policy', async () => {
    const counts = { on: 0, off: 0 };
    aiMock.generate.mockImplementation(async (call) => {
      const name = call.prompt.includes('REQUEST_ON') ? 'on' : 'off'; counts[name]++;
      await Promise.resolve();
      return { output: counts[name] % 2 ? { jokes: candidates } : rankings() };
    });
    await Promise.all([generateJoke({ topicHint: 'REQUEST_ON' }, { allowRepair: true }), generateJoke({ topicHint: 'REQUEST_OFF' })]);
    expect(counts).toEqual({ on: 4, off: 2 });
  });
});
