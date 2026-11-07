// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GenkitError } from 'genkit';

const aiMock = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock('@/ai/ai-instance', () => ({ ai: aiMock }));
import {
  GENERATION_BUDGET_MS, MODELS_UNAVAILABLE_ERROR, UnusableOutputError, createModelRunner, type ModelRunnerOptions,
} from './model-runner';
import { isModelCooling, markModelFailure, resetModelHealth } from '@/ai/modelHealth';
import { MAX_GENERATION_CALLS } from '@/lib/generationProgress';
import { modelChain, type GeminiModel } from '@/ai/models';

const selected: GeminiModel = 'googleai/gemini-3.6-flash';
const chain = modelChain(selected);
const providerError = (status: string, http = 503) => new GenkitError({ status: status as never, message: `Error fetching from https://example.test: [${http} Busy] SECRET_PROVIDER_TEXT` });
const ok = { output: { value: 'fine' } };
const parse = (output: unknown) => {
  if (!output || typeof output !== 'object') throw new UnusableOutputError('Empty output.');
  return (output as { value: string }).value;
};
const step = { step: 'generate' as const, request: () => ({ prompt: 'SECRET_PROMPT', system: 'sys', config: { temperature: 1 } }), parse };

function setup(overrides: Partial<ModelRunnerOptions> = {}) {
  const logs: Array<[string, Record<string, unknown>]> = [];
  const calls: GeminiModel[] = [];
  const fallbacks: Array<[GeminiModel, GeminiModel]> = [];
  const runner = createModelRunner({
    selected, onCall: model => calls.push(model), onFallback: (from, to) => fallbacks.push([from, to]),
    onLog: (event, fields) => logs.push([event, fields]), ...overrides,
  });
  return { runner, logs, calls, fallbacks };
}

beforeEach(() => { aiMock.generate.mockReset(); resetModelHealth(); });
afterEach(() => { vi.useRealTimers(); resetModelHealth(); });

describe('model chain and fallback', () => {
  it('first success uses the selected model, an abort signal and catalog thinking config', async () => {
    aiMock.generate.mockResolvedValueOnce(ok);
    const { runner, calls } = setup();
    await expect(runner.run(step)).resolves.toEqual({ value: 'fine', model: selected });
    expect(calls).toEqual([selected]);
    const call = aiMock.generate.mock.calls[0][0];
    expect(call).toMatchObject({ model: selected, prompt: 'SECRET_PROMPT', system: 'sys', config: { temperature: 1, thinkingConfig: { thinkingLevel: 'LOW' } } });
    expect(call.abortSignal).toBeInstanceOf(AbortSignal);
    expect(runner.callCount).toBe(1);
  });
  it('omits thinking config for models without a catalog thinking level', async () => {
    aiMock.generate.mockResolvedValueOnce(ok);
    await setup({ selected: 'googleai/gemini-3.5-flash-lite' }).runner.run(step);
    expect(aiMock.generate.mock.calls[0][0].config).toEqual({ temperature: 1 });
  });
  it.each(['UNAVAILABLE', 'RESOURCE_EXHAUSTED', 'INTERNAL', 'DEADLINE_EXCEEDED', 'UNKNOWN', 'NOT_FOUND', 'INVALID_ARGUMENT'])(
    'falls back on %s with safe logs and a cool-down', async status => {
      aiMock.generate.mockRejectedValueOnce(providerError(status)).mockResolvedValueOnce(ok);
      const { runner, logs, calls, fallbacks } = setup();
      await expect(runner.run(step)).resolves.toEqual({ value: 'fine', model: chain[1] });
      expect(calls).toEqual([chain[0], chain[1]]);
      expect(fallbacks).toEqual([[chain[0], chain[1]]]);
      expect(logs).toContainEqual(['attempt-failed', expect.objectContaining({ model: chain[0], step: 'generate', reason: 'provider', providerStatus: status, httpStatus: 503 })]);
      expect(logs).toContainEqual(['model-fallback', expect.objectContaining({ fromModel: chain[0], toModel: chain[1] })]);
      expect(JSON.stringify(logs)).not.toMatch(/SECRET/);
      expect(isModelCooling(chain[0])).toBe(true);
      expect(isModelCooling(chain[1])).toBe(false);
    });
  it('falls back on a status-less error (e.g. network failure) and logs only its class name', async () => {
    aiMock.generate.mockRejectedValueOnce(new TypeError('fetch failed SECRET_PROVIDER_TEXT')).mockResolvedValueOnce(ok);
    const { runner, logs, calls } = setup();
    await expect(runner.run(step)).resolves.toEqual({ value: 'fine', model: chain[1] });
    expect(calls).toEqual([chain[0], chain[1]]);
    expect(logs).toContainEqual(['attempt-failed', expect.objectContaining({ model: chain[0], reason: 'network', errorName: 'TypeError' })]);
    expect(JSON.stringify(logs)).not.toMatch(/SECRET|fetch failed/);
    expect(isModelCooling(chain[0])).toBe(true);
  });
  it.each(['PERMISSION_DENIED', 'UNAUTHENTICATED', 'FAILED_PRECONDITION'])(
    'rethrows non-eligible status %s without fallback or cool-down (same key fails on every model)', async status => {
      const error = new GenkitError({ status: status as never, message: 'denied' });
      aiMock.generate.mockRejectedValueOnce(error);
      const { runner } = setup();
      await expect(runner.run(step)).rejects.toBe(error);
      expect(aiMock.generate).toHaveBeenCalledTimes(1);
      expect(isModelCooling(chain[0])).toBe(false);
    });
  it('treats a Genkit schema ValidationError as unusable output, ending in the step error rather than MODELS_UNAVAILABLE', async () => {
    const validation = () => Object.assign(new GenkitError({ status: 'INVALID_ARGUMENT', message: 'Schema validation failed SECRET_PROVIDER_TEXT' }), { name: 'ValidationError' });
    aiMock.generate.mockRejectedValue(validation());
    const { runner, logs, calls } = setup();
    await expect(runner.run(step)).rejects.toThrow('Empty output.');
    expect(calls).toEqual(chain);
    expect(logs).toContainEqual(['attempt-failed', expect.objectContaining({ model: chain[0], reason: 'output' })]);
    expect(JSON.stringify(logs)).not.toMatch(/SECRET/);
  });
  it('treats unusable output as fallback-eligible and rethrows the last output error when exhausted', async () => {
    aiMock.generate.mockResolvedValue({ output: null });
    const { runner, logs } = setup();
    await expect(runner.run(step)).rejects.toThrow('Empty output.');
    expect(aiMock.generate.mock.calls.map(([call]) => call.model)).toEqual(chain);
    expect(logs.filter(([event]) => event === 'attempt-failed').map(([, fields]) => fields.reason)).toEqual(['output', 'output', 'output']);
  });
  it('reports MODELS_UNAVAILABLE when provider failures exhaust the chain', async () => {
    aiMock.generate.mockRejectedValue(providerError('UNAVAILABLE'));
    const { runner } = setup();
    await expect(runner.run(step)).rejects.toThrow(MODELS_UNAVAILABLE_ERROR);
    expect(MODELS_UNAVAILABLE_ERROR).toBe('All models are busy right now. Please try again in a minute.');
    expect(aiMock.generate).toHaveBeenCalledTimes(3);
    for (const model of chain) expect(isModelCooling(model)).toBe(true);
  });
  it('is sticky: later steps start from the model that worked', async () => {
    aiMock.generate.mockRejectedValueOnce(providerError('RESOURCE_EXHAUSTED', 429)).mockResolvedValue(ok);
    const { runner } = setup();
    await runner.run(step);
    await expect(runner.run({ ...step, step: 'critic' })).resolves.toEqual({ value: 'fine', model: chain[1] });
    expect(aiMock.generate.mock.calls.map(([call]) => call.model)).toEqual([chain[0], chain[1], chain[1]]);
  });
  it('starts with a healthy model when the selected one is cooling and clears a success', async () => {
    markModelFailure(chain[0]); markModelFailure(chain[1]);
    aiMock.generate.mockRejectedValueOnce(providerError('UNAVAILABLE')).mockResolvedValueOnce(ok);
    const { runner, logs } = setup();
    await expect(runner.run(step)).resolves.toEqual({ value: 'fine', model: chain[0] });
    expect(aiMock.generate.mock.calls.map(([call]) => call.model)).toEqual([chain[2], chain[0]]);
    expect(logs).toContainEqual(['chain-reordered', expect.objectContaining({ selectedModel: chain[0], model: chain[2] })]);
    expect(isModelCooling(chain[0])).toBe(false);
    expect(isModelCooling(chain[2])).toBe(true);
  });
});

describe('client abort', () => {
  it('never retries or cools a model when the request aborts mid-call', async () => {
    const controller = new AbortController();
    aiMock.generate.mockImplementationOnce(async () => { controller.abort(); throw providerError('UNAVAILABLE'); });
    const { runner } = setup({ signal: controller.signal });
    await expect(runner.run(step)).rejects.toThrow('Generation request disconnected.');
    expect(aiMock.generate).toHaveBeenCalledTimes(1);
    expect(isModelCooling(chain[0])).toBe(false);
  });
  it('makes no call when already aborted', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(setup({ signal: controller.signal }).runner.run(step)).rejects.toThrow('disconnected');
    expect(aiMock.generate).not.toHaveBeenCalled();
  });
  it('passes a signal that follows the request signal', async () => {
    const controller = new AbortController();
    let attemptSignal!: AbortSignal;
    aiMock.generate.mockImplementationOnce(({ abortSignal }) => { attemptSignal = abortSignal; return new Promise(() => {}); });
    const pending = setup({ signal: controller.signal }).runner.run(step);
    await vi.waitFor(() => expect(attemptSignal).toBeDefined());
    controller.abort();
    await expect(pending).rejects.toThrow('disconnected');
    expect(attemptSignal.aborted).toBe(true);
  });
});

describe('time budget and call cap', () => {
  const hang = () => new Promise(() => {});
  it.each([['generate', 35_000], ['critic', 25_000]] as const)('times out a %s attempt after %i ms and falls back', async (kind, timeout) => {
    vi.useFakeTimers();
    let firstSignal!: AbortSignal;
    aiMock.generate.mockImplementationOnce(({ abortSignal }) => { firstSignal = abortSignal; return hang(); }).mockResolvedValueOnce(ok);
    const { runner, logs, fallbacks } = setup();
    const pending = runner.run({ ...step, step: kind });
    await vi.advanceTimersByTimeAsync(timeout - 1);
    expect(aiMock.generate).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toEqual({ value: 'fine', model: chain[1] });
    expect(firstSignal.aborted).toBe(true);
    expect(fallbacks).toEqual([[chain[0], chain[1]]]);
    expect(logs).toContainEqual(['attempt-failed', expect.objectContaining({ reason: 'timeout', model: chain[0] })]);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('caps the whole request at the budget, shortening the last attempt', async () => {
    vi.useFakeTimers();
    const started = Date.now();
    aiMock.generate.mockImplementation(hang);
    const { runner } = setup({ startedAt: started });
    const pending = runner.run(step);
    const assertion = expect(pending).rejects.toThrow(MODELS_UNAVAILABLE_ERROR);
    await vi.advanceTimersByTimeAsync(GENERATION_BUDGET_MS);
    await assertion;
    expect(aiMock.generate).toHaveBeenCalledTimes(3);
    expect(Date.now() - started).toBe(90_000);
  });
  it('skips a fallback when less than ten seconds remain', async () => {
    vi.useFakeTimers();
    aiMock.generate.mockImplementation(hang);
    const { runner, logs } = setup({ startedAt: Date.now() - 75_000 });
    const pending = runner.run(step);
    const assertion = expect(pending).rejects.toThrow(MODELS_UNAVAILABLE_ERROR);
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
    expect(aiMock.generate).toHaveBeenCalledTimes(1);
    expect(logs.map(([event]) => event)).toContain('fallback-skipped');
    // The 15 s attempt was cut short by the request budget, not by the model.
    expect(isModelCooling(chain[0])).toBe(false);
  });
  it('cools a model whose attempt used its full step timeout', async () => {
    vi.useFakeTimers();
    aiMock.generate.mockImplementationOnce(hang).mockResolvedValueOnce(ok);
    const { runner } = setup();
    const pending = runner.run(step);
    await vi.advanceTimersByTimeAsync(35_000);
    await pending;
    expect(isModelCooling(chain[0])).toBe(true);
  });
  it('fails without calling when the budget is already spent', async () => {
    const { runner } = setup({ startedAt: Date.now() - GENERATION_BUDGET_MS });
    await expect(runner.run(step)).rejects.toThrow(MODELS_UNAVAILABLE_ERROR);
    expect(aiMock.generate).not.toHaveBeenCalled();
  });
  it(`never exceeds ${MAX_GENERATION_CALLS} calls per request`, async () => {
    aiMock.generate.mockResolvedValue(ok);
    const { runner } = setup();
    for (let i = 0; i < MAX_GENERATION_CALLS; i++) await runner.run(step);
    await expect(runner.run(step)).rejects.toThrow();
    expect(aiMock.generate).toHaveBeenCalledTimes(MAX_GENERATION_CALLS);
  });
});
