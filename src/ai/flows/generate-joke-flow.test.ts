// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GenkitError } from 'genkit';
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
import { DEFAULT_GENERATE_MODEL, GEMINI_MODELS, modelChain } from '@/ai/models';
import { resetModelHealth } from '@/ai/modelHealth';
import type { GenerationProgress } from '@/lib/generationProgress';

const chain = modelChain(DEFAULT_GENERATE_MODEL);
const candidates = Array.from({ length: 6 }, (_, index) => ({ jokeText: `Candidate ${index}`, category: 'Observational' }));
const replacement = candidates.map((c) => ({ ...c, jokeText: `Repaired ${c.jokeText}` }));
const rankings = (scores = [2, 9, 4, 8, 3, 7]) => ({
  rankings: scores.map((score, index) => ({
    index, score, reason: 'Fixture score', safeForGeneralAudience: true, fitsRequest: true, original: true,
    premiseKey: `Premise ${index}`, mechanismKey: `Mechanism ${index}`,
  })),
});
const out = (jokes: Array<{ jokeText: string; category: string }>, model: string = DEFAULT_GENERATE_MODEL, requestedCount = 3) => ({ jokes, model, requestedCount });
const qualityError = 'Joke quality check failed. Please try again.';
const scarcityError = 'Could not produce three eligible, unique jokes. Please try again.';
const busyError = 'All models are busy right now. Please try again in a minute.';
/** A step failure that never falls back (same key fails on every model). */
const hardError = () => new GenkitError({ status: 'PERMISSION_DENIED' as never, message: 'private upstream details' });
const providerError = (status = 'UNAVAILABLE') => new GenkitError({ status: status as never, message: '[503 Service Unavailable] provider text' });
function initial(verdict: unknown = rankings(), jokes: unknown[] = candidates) {
  aiMock.generate.mockResolvedValueOnce({ output: { jokes } }).mockResolvedValueOnce({ output: verdict });
}

beforeEach(() => { aiMock.generate.mockReset(); resetModelHealth(); });

describe('real progress boundaries', () => {
  it('reports stages before each awaited call and includes repair/fallback without extra calls', async () => {
    initial();
    aiMock.generate.mockRejectedValueOnce(hardError());
    const events: GenerationProgress[] = [];
    await generateJoke({}, { allowRepair: true, onProgress: event => events.push(event) });
    expect(events.map(e => e.stage)).toEqual(['generating', 'reviewing', 'selecting', 'repairing', 'repair-fallback']);
    expect(events.map(e => e.callCount)).toEqual([1, 2, 2, 3, 3]);
    expect(events.every(e => e.model === DEFAULT_GENERATE_MODEL)).toBe(true);
    expect(aiMock.generate).toHaveBeenCalledTimes(3);
  });
  it('disconnect prevents the next model call, without pretending to cancel an in-flight provider request', async () => {
    const controller = new AbortController();
    aiMock.generate.mockImplementationOnce(async () => { controller.abort(); return { output: { jokes: candidates } }; });
    await expect(generateJoke({}, { signal: controller.signal })).rejects.toThrow('disconnected');
    expect(aiMock.generate).toHaveBeenCalledTimes(1);
  });
  it('reports default-off progress and observer failure cannot break generation', async () => {
    initial(rankings([10, 9, 8, 7, 6, 5]));
    const stages: string[] = [];
    await generateJoke({}, { onProgress: event => { stages.push(event.stage); throw new Error('observer'); } });
    expect(stages).toEqual(['generating', 'reviewing', 'selecting']);
    expect(aiMock.generate).toHaveBeenCalledTimes(2);
  });
});

describe('model fallback inside the flow', () => {
  it('falls back on a provider error, reports a fallback frame with the next model and returns that model', async () => {
    aiMock.generate.mockRejectedValueOnce(providerError());
    initial(rankings([10, 9, 8, 7, 6, 5]));
    const events: GenerationProgress[] = [];
    const logs: Array<[string, Record<string, unknown>]> = [];
    const topicHint = 'PRIVATE_TOPIC';
    await expect(generateJoke({ topicHint }, { onProgress: e => events.push(e), onLog: (event, fields) => logs.push([event, fields]) }))
      .resolves.toEqual(out(candidates.slice(0, 3), chain[1]));
    expect(events.map(e => [e.stage, e.model, e.callCount])).toEqual([
      ['generating', chain[0], 1], ['fallback', chain[1], 1], ['generating', chain[1], 2], ['reviewing', chain[1], 3], ['selecting', chain[1], 3],
    ]);
    expect(aiMock.generate.mock.calls.map(([call]) => call.model)).toEqual([chain[0], chain[1], chain[1]]);
    expect(logs).toContainEqual(['attempt-failed', expect.objectContaining({ providerStatus: 'UNAVAILABLE', httpStatus: 503 })]);
    expect(logs).toContainEqual(['model-fallback', expect.objectContaining({ fromModel: chain[0], toModel: chain[1] })]);
    expect(JSON.stringify(logs)).not.toMatch(/PRIVATE_TOPIC|Candidate|provider text/);
  });
  it('falls back when the model returns fewer unique candidates than requested', async () => {
    aiMock.generate.mockResolvedValueOnce({ output: { jokes: candidates.map(c => ({ ...c, jokeText: 'same!' })) } });
    initial(rankings([10, 9, 8, 7, 6, 5]));
    await expect(generateJoke({})).resolves.toEqual(out(candidates.slice(0, 3), chain[1]));
  });
  it('falls back to the next model when the critic returns no valid ranking', async () => {
    initial({ rankings: [] });
    aiMock.generate.mockResolvedValueOnce({ output: rankings([10, 9, 8, 7, 6, 5]) });
    await expect(generateJoke({})).resolves.toEqual(out(candidates.slice(0, 3), chain[0]));
    expect(aiMock.generate.mock.calls.map(([call]) => call.model)).toEqual([chain[0], chain[0], chain[1]]);
  });
  it('reports MODELS_UNAVAILABLE when every model fails with a provider error', async () => {
    aiMock.generate.mockRejectedValue(providerError('RESOURCE_EXHAUSTED'));
    await expect(generateJoke({})).rejects.toThrow(busyError);
    expect(aiMock.generate).toHaveBeenCalledTimes(3);
  });
  it('accepts a legacy model alias and resolves it to the catalog model', async () => {
    initial();
    await expect(generateJoke({ model: 'googleai/gemini-2.5-flash' })).resolves.toMatchObject({ model: 'googleai/gemini-3.5-flash-lite' });
    expect(aiMock.generate.mock.calls[0][0].model).toBe('googleai/gemini-3.5-flash-lite');
  });
});

describe('explicit-index quality selection', () => {
  it('selects explicit indices from shuffled full permutation, independent of verdict order', async () => {
    const verdict = rankings();
    verdict.rankings = [verdict.rankings[5], verdict.rankings[0], verdict.rankings[3], verdict.rankings[2], verdict.rankings[1], verdict.rankings[4]];
    initial(verdict);
    await expect(generateJoke({})).resolves.toEqual(out([candidates[1], candidates[3], candidates[5]]));
  });
  it.each(['safeForGeneralAudience', 'fitsRequest', 'original'] as const)('excludes score10 candidate when %s false', async (gate) => {
    const verdict = rankings([10, 9, 8, 7, 6, 5]);
    verdict.rankings[0][gate] = false;
    initial(verdict);
    await expect(generateJoke({})).resolves.toEqual(out(candidates.slice(1, 4)));
  });
  it.each([0, 6, 0.5])('tolerates malformed index %s: the row is dropped and that candidate is unranked', async (index) => {
    const verdict = rankings(); verdict.rankings[5].index = index;
    initial(verdict);
    await expect(generateJoke({})).resolves.toEqual(out([candidates[1], candidates[3], candidates[2]]));
    expect(aiMock.generate).toHaveBeenCalledTimes(2);
  });
  it.each([
    ['safeForGeneralAudience', 'true'], ['fitsRequest', 1], ['original', null], ['score', NaN], ['score', Infinity],
    ['score', 0], ['score', 11], ['reason', '  '], ['reason', 'x'.repeat(501)],
    ['premiseKey', '!!!'], ['mechanismKey', ''], ['premiseKey', 'x'.repeat(81)],
  ])('drops a row with malformed critic field %s=%s and keeps the others', async (key, value) => {
    const verdict = rankings([9, 2, 4, 8, 3, 7]); Object.assign(verdict.rankings[0], { [key]: value }); initial(verdict);
    await expect(generateJoke({})).resolves.toEqual(out([candidates[3], candidates[5], candidates[2]]));
    expect(aiMock.generate).toHaveBeenCalledTimes(2);
  });
  it.each([null, 'bad', { rankings: [] }])('fails closed with a quality error when no model returns a valid critic output %j', async (output) => {
    aiMock.generate.mockResolvedValueOnce({ output: { jokes: candidates } }).mockResolvedValue({ output });
    await expect(generateJoke({}, { allowRepair: true })).rejects.toThrow(qualityError);
    expect(aiMock.generate).toHaveBeenCalledTimes(4);
  });
  it('accepts a partial critic output', async () => {
    initial({ rankings: rankings().rankings.slice(0, 5) });
    await expect(generateJoke({})).resolves.toEqual(out([candidates[1], candidates[3], candidates[2]]));
  });
  it('fails closed on throwing initial critic even with repair enabled', async () => {
    aiMock.generate.mockResolvedValueOnce({ output: { jokes: candidates } }).mockRejectedValueOnce(hardError());
    await expect(generateJoke({}, { allowRepair: true })).rejects.toThrow(qualityError);
    expect(aiMock.generate).toHaveBeenCalledTimes(2);
  });
  it('drops normalized duplicate candidates before the critic sees them', async () => {
    const jokes = candidates.map(c => ({ ...c }));
    jokes[0].jokeText = ' ＨＥＬＬＯ...  World '; jokes[1].jokeText = 'hello world';
    initial(rankings([9, 10, 8, 7, 2, 1]), jokes);
    await expect(generateJoke({})).resolves.toEqual(out([jokes[2], jokes[0], jokes[3]]));
    const critic = aiMock.generate.mock.calls[1][0].prompt;
    expect(critic).not.toContain('hello world');
    expect(critic).toContain('Score all 5 candidates');
  });
  it('keeps only the first twice-count unique candidates', async () => {
    const extra = Array.from({ length: 8 }, (_, index) => ({ jokeText: `Extra ${index}`, category: 'Work' }));
    initial(rankings([10, 9, 8, 7, 6, 5]), extra);
    await expect(generateJoke({})).resolves.toEqual(out(extra.slice(0, 3)));
    expect(aiMock.generate.mock.calls[1][0].prompt).not.toContain('Extra 6');
  });
  it.each(['prefilledJokes', 'exemplarJokes', 'recentGeneratedJokes'] as const)('excludes normalized reference copy from %s', async (field) => {
    initial(rankings([10, 9, 8, 7, 6, 5]));
    await expect(generateJoke({ [field]: [' ＣＡＮＤＩＤＡＴＥ 0!!! '] })).resolves.toEqual(out(candidates.slice(1, 4)));
  });
  it('without count, throws scarcity and never pads or returns fewer than three', async () => {
    const verdict = rankings();
    verdict.rankings.slice(2).forEach(r => { r.original = false; });
    initial(verdict);
    await expect(generateJoke({})).rejects.toThrow(scarcityError);
    expect(aiMock.generate).toHaveBeenCalledTimes(2);
  });
});

describe('requested count', () => {
  it('count 1 asks for two candidates and returns one joke', async () => {
    initial(rankings([4, 8]), candidates.slice(0, 2));
    await expect(generateJoke({ count: 1 })).resolves.toEqual(out([candidates[1]], DEFAULT_GENERATE_MODEL, 1));
    expect(aiMock.generate.mock.calls[0][0].prompt).toContain('Generate 2 different');
    expect(aiMock.generate.mock.calls[1][0].prompt).toContain('Score all 2 candidates');
  });
  it('count 5 asks for ten candidates and returns five', async () => {
    const ten = Array.from({ length: 10 }, (_, index) => ({ jokeText: `Ten ${index}`, category: 'Work' }));
    initial(rankings([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), ten);
    await expect(generateJoke({ count: 5 })).resolves.toEqual(out([ten[9], ten[8], ten[7], ten[6], ten[5]], DEFAULT_GENERATE_MODEL, 5));
    expect(aiMock.generate.mock.calls[0][0].prompt).toContain('Generate 10 different');
  });
  it('with count, returns a partial batch when fewer jokes pass the gates', async () => {
    const verdict = rankings();
    verdict.rankings.slice(2).forEach(r => { r.original = false; });
    initial(verdict);
    await expect(generateJoke({ count: 3 })).resolves.toEqual(out([candidates[1], candidates[0]], DEFAULT_GENERATE_MODEL, 3));
  });
  it('with count, nothing eligible is still an insufficient-jokes error', async () => {
    const verdict = rankings(); verdict.rankings.forEach(r => { r.safeForGeneralAudience = false; });
    initial(verdict);
    await expect(generateJoke({ count: 3 })).rejects.toThrow('No joke passed the quality check. Please try again.');
  });
  it('with count, accepts as few candidates as the count', async () => {
    initial(rankings([5, 6, 7]), candidates.slice(0, 3));
    await expect(generateJoke({ count: 3 })).resolves.toEqual(out([candidates[2], candidates[1], candidates[0]], DEFAULT_GENERATE_MODEL, 3));
  });
});

describe('taste profile', () => {
  const taste = {
    samples: ['Sample joke text'],
    liked: [{ text: 'Liked joke text', reason: 'tight' }],
    disliked: [{ text: 'Disliked joke!', reason: 'too long' }],
  };
  it('reaches generator and critic, and taste texts are copy references', async () => {
    const jokes = candidates.map(c => ({ ...c })); jokes[0].jokeText = 'sample joke text';
    initial(rankings([10, 9, 8, 7, 6, 5]), jokes);
    await expect(generateJoke({ taste })).resolves.toEqual(out(candidates.slice(1, 4)));
    const [generator, critic] = aiMock.generate.mock.calls.map(([call]) => call);
    for (const text of ['Sample joke text', 'Liked joke text', 'Disliked joke!', 'too long']) {
      expect(generator.prompt).toContain(text);
      expect(critic.prompt).toContain(text);
    }
    expect(generator.prompt).toContain('match the craft, not the material');
    expect(critic.prompt).toContain('strongest quality signal');
  });
  it('removes disliked taste texts from the avoid list so they appear once, with their reason', async () => {
    initial();
    await generateJoke({ taste, avoidJokes: ['disliked joke', 'Other weak joke'] });
    const prompt = aiMock.generate.mock.calls[0][0].prompt as string;
    expect(prompt).not.toContain('- "disliked joke"');
    expect(prompt).toContain('- "Other weak joke"');
    expect(prompt.split('Disliked joke!')).toHaveLength(2);
  });
  it('still applies taste to the critic in classic mode', async () => {
    initial();
    await generateJoke({ taste, mode: 'classic' });
    expect(aiMock.generate.mock.calls[1][0].system).toContain('Classic mode');
    expect(aiMock.generate.mock.calls[1][0].prompt).toContain('Liked joke text');
  });
  it('an empty profile adds no taste section', async () => {
    initial();
    await generateJoke({ taste: { samples: [], liked: [], disliked: [] } });
    expect(aiMock.generate.mock.calls[0][0].prompt).not.toContain('taste profile');
    expect(aiMock.generate.mock.calls[1][0].prompt).not.toContain('Taste profile');
  });
});

describe('hinge-first candidates', () => {
  it('requests a hinge per candidate and returns only joke text and category', async () => {
    const hinged = candidates.map((c, i) => ({ hinge: `hinge ${i}`, mechanism: 'double meaning', ...c }));
    initial(rankings([10, 9, 8, 7, 6, 5]), hinged);
    await expect(generateJoke({})).resolves.toEqual(out(candidates.slice(0, 3)));
    const schema = aiMock.generate.mock.calls[0][0].output.schema;
    expect(schema.parse({ jokes: hinged }).jokes[0].hinge).toBe('hinge 0');
    expect(schema.safeParse({ jokes: candidates }).success).toBe(true);
  });
});

describe('taste calibration and automatic checks', () => {
  it('penalizes lint issues so a loud, marked pun loses to cleaner jokes', async () => {
    const jokes = candidates.map(c => ({ ...c }));
    jokes[0].jokeText = "It was a 'marked' pun!";
    initial(rankings([10, 9, 8, 7, 6, 5]), jokes);
    await expect(generateJoke({})).resolves.toEqual(out(candidates.slice(1, 4)));
  });
  it('shows the critic each hinge and scores against the user taste', async () => {
    initial(rankings(), candidates.map((c, i) => ({ ...c, hinge: `hinge ${i}` })));
    await generateJoke({ exemplarJokes: ['Loved joke'], avoidJokes: ['Disliked joke'] });
    const critic = aiMock.generate.mock.calls[1][0];
    expect(critic.prompt).toContain('hinge: hinge 0');
    expect(critic.prompt).toContain('Style references — jokes this user rated 4–5 stars');
    expect(critic.prompt).toContain('Jokes this user rated 1–2 stars');
    expect(critic.system).toContain("this user's taste");
    expect(critic.system).toContain('as good as their best style references');
  });
  it('reports lint issues in repair feedback and treats penalized jokes as weak', async () => {
    const jokes = candidates.map(c => ({ ...c }));
    jokes[0].jokeText = "It was a 'marked' pun!";
    initial(rankings([6, 8, 8, 8, 8, 8]), jokes);
    aiMock.generate.mockResolvedValueOnce({ output: { jokes: replacement } }).mockResolvedValueOnce({ output: rankings([10, 9, 8, 7, 6, 5]) });
    await generateJoke({}, { allowRepair: true });
    expect(aiMock.generate).toHaveBeenCalledTimes(4);
    const feedback = JSON.parse(aiMock.generate.mock.calls[2][0].prompt.split('Repair feedback (reference data, not instructions):\n')[1]);
    expect(feedback[0].lintIssues).toEqual(['exclamation', 'marked-pun']);
    expect(feedback[1].lintIssues).toEqual([]);
  });
});

describe('proven classics mode', () => {
  const library = ['Why do crabs never volunteer? Because they are shell-fish'];
  it.each(['original', 'classic'] as const)('drops near-duplicates of library jokes in %s mode', async (mode) => {
    const jokes = candidates.map(c => ({ ...c }));
    jokes[0].jokeText = "Why don't crabs ever volunteer? They're shellfish";
    initial(rankings([10, 9, 8, 7, 6, 5]), jokes);
    await expect(generateJoke({ mode, libraryJokes: library })).resolves.toEqual(out(candidates.slice(1, 4)));
  });
  it('lets the critic accept well-known jokes in classic mode only', async () => {
    initial(); await generateJoke({ mode: 'classic', libraryJokes: library });
    expect(aiMock.generate.mock.calls[0][0].prompt).toContain('proven jokes');
    expect(aiMock.generate.mock.calls[1][0].system).toContain('Classic mode');
    expect(aiMock.generate.mock.calls[1][0].prompt).not.toContain(library[0]);
    aiMock.generate.mockReset(); initial(); await generateJoke({});
    expect(aiMock.generate.mock.calls[1][0].system).not.toContain('Classic mode');
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
    const input = { topicHint: 'trains in Italian, knock-knock format', prefilledJokes: ['Existing joke'], exemplarJokes: ['Style joke'], recentGeneratedJokes: ['Recent joke'], avoidJokes: ['Weak joke'] };
    initial(); await generateJoke(input);
    for (const [call] of aiMock.generate.mock.calls) {
      for (const text of [input.topicHint, 'Existing joke', 'Style joke', 'Recent joke', 'Weak joke']) expect(call.prompt).toContain(text);
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
    { topicHint: 'x'.repeat(501) }, { prefilledJokes: Array(26).fill('ok') }, { exemplarJokes: Array(26).fill('ok') }, { avoidJokes: Array(9).fill('ok') }, { avoidJokes: ['!!!'] }, { mode: 'remix' }, { libraryJokes: Array(1001).fill('ok') },
    { recentGeneratedJokes: Array(13).fill('ok') }, { prefilledJokes: ['!!!'] }, { exemplarJokes: ['x'.repeat(2001)] },
    { model: 'unsupported' }, { temperature: Infinity }, { temperature: NaN }, { temperature: -0.1 }, { temperature: 2.1 },
    { count: 0 }, { count: 6 }, { count: 2.5 }, { style: 'pun', count: 'three' },
    { taste: { samples: Array(11).fill('ok'), liked: [], disliked: [] } }, { taste: { samples: [], liked: [{ text: '!!!' }], disliked: [] } },
    { taste: { samples: [], liked: [], disliked: [{ text: 'ok', reason: 'x'.repeat(201) }] } },
  ])('invalid input consumes zero calls on both entry paths %j', async (input) => {
    for (const options of [undefined, { allowRepair: true }]) await expect(generateJoke(input as GenerateJokeInput, options)).rejects.toThrow();
    expect(aiMock.generate).not.toHaveBeenCalled();
  });
  it('accepts limit boundaries and validates registered path explicitly', async () => {
    initial();
    await generateJoke({ topicHint: 'x'.repeat(500), prefilledJokes: Array(25).fill('x'.repeat(2000)), exemplarJokes: Array(25).fill('example'), recentGeneratedJokes: Array(12).fill('recent'), avoidJokes: Array(8).fill('weak'), temperature: 0 });
    expect(aiMock.generate).toHaveBeenCalledTimes(2);
    aiMock.generate.mockReset();
    const handler = aiMock.defineFlow.mock.results[0].value;
    await expect(handler({ topicHint: 'x'.repeat(501) })).rejects.toThrow();
    expect(aiMock.generate).not.toHaveBeenCalled();
    const config = aiMock.defineFlow.mock.calls[0][0];
    expect(config.outputSchema.safeParse(out(candidates.slice(0, 3))).success).toBe(true);
    expect(config.outputSchema.safeParse(out([])).success).toBe(false);
    expect(config.outputSchema.safeParse({ jokes: candidates.slice(0, 3) }).success).toBe(false);
  });
  it('preserves a non-eligible provider error without fallback', async () => {
    const error = hardError(); aiMock.generate.mockRejectedValueOnce(error);
    await expect(generateJoke({}, { allowRepair: true })).rejects.toBe(error);
    expect(aiMock.generate).toHaveBeenCalledTimes(1);
  });
  it('a status-less network error tries every model, then reports models unavailable', async () => {
    aiMock.generate.mockRejectedValue(new TypeError('fetch failed'));
    await expect(generateJoke({}, { allowRepair: true })).rejects.toThrow('All models are busy right now');
    expect(aiMock.generate.mock.calls.map(([call]) => call.model)).toEqual(chain);
  });
  it.each([
    [null, 'AI failed to generate joke candidates. The output was empty.'],
    ['bad', 'AI failed to generate joke candidates. The output was empty.'],
    [{ jokes: candidates.slice(0, 2) }, 'AI returned candidate data in an unexpected format.'],
    [{ jokes: candidates.map(c => ({ ...c, jokeText: '!!!' })) }, 'AI returned candidate data in an unexpected format.'],
    [{ jokes: candidates.map(c => ({ ...c, jokeText: 'x'.repeat(2001) })) }, 'AI returned candidate data in an unexpected format.'],
    [{ jokes: candidates.map(c => ({ ...c, category: ' ' })) }, 'AI returned candidate data in an unexpected format.'],
  ])('unusable candidate output %j tries every model, then fails without critic', async (output, message) => {
    aiMock.generate.mockResolvedValue({ output });
    await expect(generateJoke({}, { allowRepair: true })).rejects.toThrow(message as string);
    expect(aiMock.generate.mock.calls.map(([call]) => call.model)).toEqual(chain);
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
  it.each(['gate', 'unranked', 'copy', 'weak'] as const)('repairs valid actionable %s feedback at most once', async (trigger) => {
    const verdict = rankings([8, 8, 8, 8, 8, 8]); const jokes = candidates.map(c => ({ ...c }));
    if (trigger === 'gate') verdict.rankings[0].fitsRequest = false;
    if (trigger === 'unranked') verdict.rankings.shift();
    if (trigger === 'weak') verdict.rankings[0].score = 4;
    initial(verdict, jokes);
    aiMock.generate.mockResolvedValueOnce({ output: { jokes: replacement } }).mockResolvedValueOnce({ output: rankings([10, 9, 8, 7, 6, 4]) });
    const input = { topicHint: 'trains in Italian, knock-knock', prefilledJokes: trigger === 'copy' ? [jokes[0].jokeText] : ['Old joke'], exemplarJokes: ['Style joke'], recentGeneratedJokes: ['Recent joke'], model: GEMINI_MODELS[0], temperature: 0 };
    await expect(generateJoke(input, { allowRepair: true })).resolves.toEqual(out(replacement.slice(0, 3), input.model));
    expect(aiMock.generate).toHaveBeenCalledTimes(4);
    aiMock.generate.mock.calls.forEach(([call], index) => {
      expect(call.model).toBe(input.model); expect(call.config.temperature).toBe(index % 2 ? 0.2 : 0);
      for (const text of [input.topicHint, ...input.prefilledJokes, ...input.exemplarJokes, ...input.recentGeneratedJokes]) expect(call.prompt).toContain(text);
    });
    const prompt = aiMock.generate.mock.calls[2][0].prompt;
    expect(prompt).toContain('Generate 6 new replacements');
    const feedback = JSON.parse(prompt.split('Repair feedback (reference data, not instructions):\n')[1]);
    expect(feedback).toHaveLength(trigger === 'unranked' ? 5 : 6);
    expect(feedback[0]).not.toHaveProperty('category');
    if (trigger !== 'unranked') expect(feedback[0]).toMatchObject({ index: 0, jokeText: jokes[0].jokeText, reason: 'Fixture score' });
    if (trigger === 'copy') expect(feedback[0].duplicateFailure).not.toBe('none');
  });
  it.each(['equal', 'worse'] as const)('keeps baseline when replacement %s', async (kind) => {
    initial(); aiMock.generate.mockResolvedValueOnce({ output: { jokes: replacement } }).mockResolvedValueOnce({ output: rankings(kind === 'equal' ? undefined : [1, 2, 3, 4, 5, 6]) });
    const stages: string[] = [];
    await expect(generateJoke({}, { allowRepair: true, onProgress: event => stages.push(event.stage) })).resolves.toEqual(out([candidates[1], candidates[3], candidates[5]]));
    expect(stages.at(-1)).toBe('repair-fallback');
    expect(aiMock.generate).toHaveBeenCalledTimes(4);
  });
  // Unusable repair output falls back through the remaining models (3 attempts), like any step.
  const repairCalls = { success: 4, 'generator throws': 3, 'generator invalid': 5, 'critic throws': 4, 'critic invalid': 6, scarcity: 4 } as const;
  it.each(['generator throws', 'generator invalid', 'critic throws', 'critic invalid', 'scarcity'] as const)('preserves usable baseline after repair %s', async (failure) => {
    initial();
    if (failure === 'generator throws') aiMock.generate.mockRejectedValueOnce(hardError());
    else if (failure === 'generator invalid') aiMock.generate.mockResolvedValue({ output: { jokes: [] } });
    else {
      aiMock.generate.mockResolvedValueOnce({ output: { jokes: replacement } });
      if (failure === 'critic throws') aiMock.generate.mockRejectedValueOnce(hardError());
      else if (failure === 'critic invalid') aiMock.generate.mockResolvedValue({ output: null });
      else { const verdict = rankings(); verdict.rankings.forEach(r => { r.original = false; }); aiMock.generate.mockResolvedValueOnce({ output: verdict }); }
    }
    const stages: string[] = [];
    await expect(generateJoke({}, { allowRepair: true, onProgress: event => stages.push(event.stage) })).resolves.toEqual(out([candidates[1], candidates[3], candidates[5]]));
    expect(stages.at(-1)).toBe('repair-fallback');
    expect(aiMock.generate).toHaveBeenCalledTimes(repairCalls[failure]);
  });
  it.each(['success', 'generator throws', 'generator invalid', 'critic throws', 'critic invalid', 'scarcity'] as const)('no-baseline repair %s obeys scarcity and call bound', async (failure) => {
    const verdict = rankings(); verdict.rankings.forEach(r => { r.original = false; }); initial(verdict);
    if (failure === 'generator throws') aiMock.generate.mockRejectedValueOnce(hardError());
    else if (failure === 'generator invalid') aiMock.generate.mockResolvedValue({ output: null });
    else {
      aiMock.generate.mockResolvedValueOnce({ output: { jokes: replacement } });
      if (failure === 'critic throws') aiMock.generate.mockRejectedValueOnce(hardError());
      else if (failure === 'critic invalid') aiMock.generate.mockResolvedValue({ output: null });
      else aiMock.generate.mockResolvedValueOnce({ output: failure === 'scarcity' ? verdict : rankings() });
    }
    const stages: string[] = [];
    const result = generateJoke({}, { allowRepair: true, onProgress: event => stages.push(event.stage) });
    if (failure === 'success') await expect(result).resolves.toEqual(out([replacement[1], replacement[3], replacement[5]]));
    else await expect(result).rejects.toThrow(scarcityError);
    expect(stages).not.toContain('repair-fallback');
    expect(aiMock.generate).toHaveBeenCalledTimes(repairCalls[failure]);
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
