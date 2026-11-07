// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { GenerateJokeInput, GenerateJokeOutput } from '@/ai/flows/generate-joke-flow';
import { DEFAULT_GENERATE_MODEL, modelChain } from '@/ai/models';

const mocks = vi.hoisted(() => ({
  generate: vi.fn(), exemplars: vi.fn(), taste: vi.fn(), auth: vi.fn(),
  defineFlow: vi.fn((_config: unknown, handler: (input: GenerateJokeInput) => Promise<GenerateJokeOutput>) => handler),
}));
// Keep real route, shared validation, flow, prompts and selector. Mock external boundaries only.
vi.mock('@/ai/ai-instance', () => ({ ai: { generate: mocks.generate, defineFlow: mocks.defineFlow } }));
vi.mock('@/lib/auth', () => ({ verifyRequestAuth: mocks.auth }));
vi.mock('@/services/server/tasteStore', () => ({ loadTasteProfile: mocks.taste }));
vi.mock('@/lib/rateLimit', () => ({ rateLimit: vi.fn(() => ({ allowed: true })), rateLimitKeyFor: vi.fn() }));
vi.mock('@/services/server/jokeExemplars', () => ({ fetchJokeExemplars: mocks.exemplars }));
import { POST } from './route';
import { resetModelHealth } from '@/ai/modelHealth';
import { GenkitError } from 'genkit';

const candidates = Array.from({ length: 6 }, (_, index) => ({ jokeText: `Candidate ${index}`, category: 'Work' }));
const verdict = () => ({ rankings: candidates.map((_, index) => ({
  index, score: 10 - index, reason: 'Clear setup with earned surprise',
  safeForGeneralAudience: true, fitsRequest: true, original: true,
  premiseKey: `Premise ${index}`, mechanismKey: `Mechanism ${index}`,
})).reverse() });
const request = (body: unknown) => new NextRequest('http://localhost/api/generate-joke', { method: 'POST', body: JSON.stringify(body) });

beforeEach(() => {
  mocks.generate.mockReset();
  mocks.exemplars.mockReset().mockResolvedValue([]);
  mocks.taste.mockReset().mockResolvedValue({ samples: [], liked: [], disliked: [] });
  mocks.auth.mockReset().mockResolvedValue({ success: true, via: 'api-token' });
  resetModelHealth();
  vi.stubEnv('JOKEHUB_ENABLE_JOKE_REPAIR', undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('generation route → real flow integration', () => {
  it('preserves browser-shaped history through prompts and selection; client repair cannot add calls', async () => {
    mocks.generate.mockResolvedValueOnce({ output: { jokes: candidates } }).mockResolvedValueOnce({ output: verdict() });
    const response = await POST(request({
      topicHint: 'Trains in Italian, knock-knock format', prefilledJokes: ['Existing reference'],
      exemplarJokes: ['Style reference'], recentGeneratedJokes: [' ＣＡＮＤＩＤＡＴＥ 0!!! '],
      temperature: 0, useServerExemplars: false, allowRepair: true,
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ jokes: candidates.slice(1, 4), model: DEFAULT_GENERATE_MODEL, requestedCount: 3 });
    expect(mocks.generate).toHaveBeenCalledTimes(2);
    expect(mocks.exemplars).not.toHaveBeenCalled();
    for (const [call] of mocks.generate.mock.calls) {
      expect(call.prompt).toContain('Trains in Italian, knock-knock format');
      expect(call.prompt).toContain(' ＣＡＮＤＩＤＡＴＥ 0!!! ');
      expect(call.prompt).toContain('Existing reference');
      expect(call.prompt).toContain('Style reference');
      expect(call.model).toBe(DEFAULT_GENERATE_MODEL);
    }
    expect(mocks.generate.mock.calls[0][0].config.temperature).toBe(0);
    expect(mocks.generate.mock.calls[1][0].config.temperature).toBe(0.2);
  });
  it('literal trusted server option reaches real repair path with four-call ceiling', async () => {
    vi.stubEnv('JOKEHUB_ENABLE_JOKE_REPAIR', 'true');
    const replacements = candidates.map(joke => ({ ...joke, jokeText: `Repaired ${joke.jokeText}` }));
    mocks.generate.mockResolvedValueOnce({ output: { jokes: candidates } }).mockResolvedValueOnce({ output: verdict() })
      .mockResolvedValueOnce({ output: { jokes: replacements } }).mockResolvedValueOnce({ output: verdict() });
    const response = await POST(request({ recentGeneratedJokes: ['Candidate 0'], useServerExemplars: false }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ jokes: replacements.slice(0, 3), model: DEFAULT_GENERATE_MODEL, requestedCount: 3 });
    expect(mocks.generate).toHaveBeenCalledTimes(4);
    expect(mocks.generate.mock.calls[2][0].prompt).toContain('Repair feedback');
    expect(mocks.generate.mock.calls[3][0].prompt).toContain('Candidate 0');
  });
  it.each([
    // An invalid critic output is retried on each remaining model before failing closed.
    [{ rankings: [] }, 'Joke quality check failed. Please try again.', 4],
    [{ rankings: verdict().rankings.map(row => ({ ...row, safeForGeneralAudience: false })) }, 'Could not produce three eligible, unique jokes. Please try again.', 2],
  ])('propagates fail-closed errors through existing API error shape', async (output, error, calls) => {
    mocks.generate.mockResolvedValueOnce({ output: { jokes: candidates } }).mockResolvedValue({ output });
    const response = await POST(request({ useServerExemplars: false }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error });
    expect(mocks.generate).toHaveBeenCalledTimes(calls);
  });
  it('studio request: legacy model, count, taste and a provider fallback, streamed end to end', async () => {
    mocks.auth.mockResolvedValue({ success: true, via: 'id-token', userId: 'uid-1' });
    mocks.taste.mockResolvedValue({ samples: ['Loved sample'], liked: [], disliked: [{ text: 'Hated joke', reason: 'too long' }] });
    const two = candidates.slice(0, 2);
    mocks.generate
      .mockRejectedValueOnce(new GenkitError({ status: 'UNAVAILABLE', message: '[503 Service Unavailable] PROVIDER_DETAIL' }))
      .mockResolvedValueOnce({ output: { jokes: two } })
      .mockResolvedValueOnce({ output: { rankings: verdict().rankings.filter(row => row.index < 2) } });
    const response = await POST(new NextRequest('http://localhost/api/generate-joke', {
      method: 'POST', headers: { Accept: 'application/x-ndjson' },
      body: JSON.stringify({ useServerExemplars: false, model: 'googleai/gemini-3.7-flash', count: 1 }),
    }));
    const frames = (await response.text()).trim().split('\n').map(line => JSON.parse(line));
    const chain = modelChain('googleai/gemini-3.8-flash');
    expect(mocks.generate.mock.calls.map(([call]) => call.model)).toEqual([chain[0], chain[1], chain[1]]);
    expect(frames).toContainEqual(expect.objectContaining({ type: 'progress', stage: 'fallback', model: chain[1] }));
    expect(frames.at(-1)).toMatchObject({ type: 'result', output: { jokes: [candidates[0]], model: chain[1], requestedCount: 1 } });
    expect(mocks.taste).toHaveBeenCalledWith('uid-1');
    for (const [call] of mocks.generate.mock.calls) expect(call.prompt).toContain('Loved sample');
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('PROVIDER_DETAIL');
  });
});
