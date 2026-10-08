// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { GenerateJokeInput, GenerateJokeOutput } from '@/ai/flows/generate-joke-flow';
import { DEFAULT_GENERATE_MODEL } from '@/ai/models';

const mocks = vi.hoisted(() => ({
  generate: vi.fn(), exemplars: vi.fn(),
  defineFlow: vi.fn((_config: unknown, handler: (input: GenerateJokeInput) => Promise<GenerateJokeOutput>) => handler),
}));
// Keep real route, shared validation, flow, prompts and selector. Mock external boundaries only.
vi.mock('@/ai/ai-instance', () => ({ ai: { generate: mocks.generate, defineFlow: mocks.defineFlow } }));
vi.mock('@/lib/auth', () => ({ verifyRequestAuth: vi.fn(async () => ({ success: true, via: 'api-token' })) }));
vi.mock('@/lib/rateLimit', () => ({ rateLimit: vi.fn(), rateLimitKeyFor: vi.fn() }));
vi.mock('@/services/server/jokeExemplars', () => ({ fetchJokeExemplars: mocks.exemplars }));
import { POST } from './route';

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
    expect(await response.json()).toEqual({ jokes: candidates.slice(1, 4) });
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
    expect(await response.json()).toEqual({ jokes: replacements.slice(0, 3) });
    expect(mocks.generate).toHaveBeenCalledTimes(4);
    expect(mocks.generate.mock.calls[2][0].prompt).toContain('Repair feedback');
    expect(mocks.generate.mock.calls[3][0].prompt).toContain('Candidate 0');
  });
  it.each([
    [{ rankings: [] }, 'Joke quality check failed. Please try again.'],
    [{ rankings: verdict().rankings.map(row => ({ ...row, safeForGeneralAudience: false })) }, 'Could not produce three eligible, unique jokes. Please try again.'],
  ])('propagates fail-closed errors through existing API error shape', async (output, error) => {
    mocks.generate.mockResolvedValueOnce({ output: { jokes: candidates } }).mockResolvedValueOnce({ output });
    const response = await POST(request({ useServerExemplars: false }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error });
    expect(mocks.generate).toHaveBeenCalledTimes(2);
  });
});
