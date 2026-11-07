/**
 * The single gateway for application `ai.generate` calls during joke
 * generation. Walks the model chain with sticky fallback, enforces the
 * per-request time budget and call cap, and feeds the cross-request
 * cool-down. Logs carry statuses only, never provider messages or prompts.
 */
import { ai } from '@/ai/ai-instance';
import { getModelInfo, modelChain, type GeminiModel } from '@/ai/models';
import { markModelFailure, markModelSuccess, orderByHealth } from '@/ai/modelHealth';
import { MAX_GENERATION_CALLS } from '@/lib/generationProgress';
import { CALL_LIMIT_ERROR, DISCONNECTED_ERROR, MODELS_UNAVAILABLE_ERROR } from './generation-errors';

export { MODELS_UNAVAILABLE_ERROR };
export const GENERATION_BUDGET_MS = 90_000;
export const STEP_TIMEOUT_MS = { generate: 35_000, critic: 25_000 } as const;
export const MIN_FALLBACK_REMAINING_MS = 10_000;

/** GenkitError statuses that mean "try another model". */
export const FALLBACK_STATUSES: ReadonlySet<string> = new Set([
  'UNAVAILABLE', 'RESOURCE_EXHAUSTED', 'INTERNAL', 'DEADLINE_EXCEEDED', 'UNKNOWN', 'NOT_FOUND', 'INVALID_ARGUMENT',
]);

export type GenerationStep = keyof typeof STEP_TIMEOUT_MS;
type FailureReason = 'provider' | 'network' | 'timeout' | 'output';
export type RunnerLogFields = Record<string, string | number>;

/** Thrown by a step parser when the model answered with unusable data. */
export class UnusableOutputError extends Error {}
/** Errors produced by the runner itself; callers must not rewrap them. */
export class ModelRunnerError extends Error {}

export function isRunnerError(error: unknown): boolean {
  return error instanceof ModelRunnerError || error instanceof UnusableOutputError;
}

export type ModelRunnerOptions = {
  selected: GeminiModel;
  signal?: AbortSignal;
  /** Request start (ms epoch) the budget counts from; defaults to runner creation. */
  startedAt?: number;
  /** Before each attempt, after the call count increments. */
  onCall?: (model: GeminiModel, callCount: number) => void;
  /** Before switching to the next model in the chain. */
  onFallback?: (fromModel: GeminiModel, toModel: GeminiModel, callCount: number) => void;
  onLog?: (event: string, fields: RunnerLogFields) => void;
};

type GenerateRequest = { prompt: string; system?: string; output?: { schema: unknown }; config?: Record<string, unknown> };
export type RunnerStep<T> = {
  step: GenerationStep;
  request: (model: GeminiModel) => GenerateRequest;
  /** Returns the usable value or throws UnusableOutputError. */
  parse: (output: unknown) => T;
};

function providerStatus(error: unknown): string | undefined {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'string' ? status : undefined;
}

/** Class name only (e.g. `TypeError`), never the message; anything unusual is redacted. */
function errorName(error: unknown): string {
  const name = error instanceof Error ? error.name : typeof error;
  return /^[A-Za-z]{1,40}$/.test(name) ? name : 'Error';
}

function isSchemaValidationError(error: unknown): boolean {
  return error instanceof Error && error.name === 'ValidationError';
}

/** The error a step's parser raises for missing output: its public failure message. */
function stepOutputError(parse: (output: unknown) => unknown): UnusableOutputError {
  try { parse(undefined); } catch (error) {
    if (error instanceof UnusableOutputError) return error;
  }
  return new UnusableOutputError('AI returned data in an unexpected format.');
}

/** Digits from a `[NNN ...` HTTP marker only; never any other message text. */
function httpStatus(error: unknown): number | undefined {
  const message = error instanceof Error ? error.message : '';
  const match = /\[([1-5]\d\d)[\s\]]/.exec(message);
  return match ? Number(match[1]) : undefined;
}

export function createModelRunner(options: ModelRunnerOptions) {
  const startedAt = options.startedAt ?? Date.now();
  const preferred = modelChain(options.selected);
  const chain = orderByHealth(preferred);
  let index = 0;
  let callCount = 0;
  const log = (event: string, fields: RunnerLogFields) => {
    try { options.onLog?.(event, fields); } catch { /* Observability cannot change generation. */ }
  };
  if (chain[0] !== preferred[0]) log('chain-reordered', { selectedModel: preferred[0], model: chain[0] });

  const remaining = () => startedAt + GENERATION_BUDGET_MS - Date.now();
  const disconnected = () => new ModelRunnerError(DISCONNECTED_ERROR);

  async function attempt(model: GeminiModel, request: GenerateRequest, timeoutMs: number) {
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), timeoutMs);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout.signal]) : timeout.signal;
    let onAbort: () => void = () => {};
    // Race the call so a provider that ignores abortSignal still cannot outlive the budget.
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => reject(new Error('aborted'));
      signal.addEventListener('abort', onAbort, { once: true });
    });
    const { thinkingLevel, maxTemperature } = getModelInfo(model) as { thinkingLevel?: string; maxTemperature?: number };
    const config: Record<string, unknown> = { ...request.config, ...(thinkingLevel ? { thinkingConfig: { thinkingLevel } } : {}) };
    if (maxTemperature !== undefined && typeof config.temperature === 'number') config.temperature = Math.min(config.temperature, maxTemperature);
    try {
      const response = await Promise.race([
        Promise.resolve().then(() => ai.generate({ ...request, model, config, abortSignal: signal } as Parameters<typeof ai.generate>[0])),
        aborted,
      ]);
      return { response: response as { output?: unknown } | undefined, timedOut: false };
    } catch (error) {
      if (options.signal?.aborted) throw disconnected();
      if (timeout.signal.aborted) return { error, timedOut: true };
      return { error, timedOut: false };
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
    }
  }

  async function run<T>({ step, request, parse }: RunnerStep<T>): Promise<{ value: T; model: GeminiModel }> {
    let lastReason: FailureReason | undefined;
    let lastOutputError: UnusableOutputError | undefined;
    const exhausted = (): Error => {
      if (lastReason === 'output' && lastOutputError) return lastOutputError;
      if (lastReason) return new ModelRunnerError(MODELS_UNAVAILABLE_ERROR);
      return new ModelRunnerError(CALL_LIMIT_ERROR);
    };
    while (index < chain.length) {
      if (options.signal?.aborted) throw disconnected();
      const model = chain[index];
      const left = remaining();
      if (left <= 0) { lastReason ??= 'timeout'; throw exhausted(); }
      if (callCount >= MAX_GENERATION_CALLS) throw exhausted();
      callCount++;
      try { options.onCall?.(model, callCount); } catch { /* Observability cannot change generation. */ }
      const attemptStarted = Date.now();
      const timeoutMs = Math.min(STEP_TIMEOUT_MS[step], left);
      const result = await attempt(model, request(model), timeoutMs);
      let failure: Record<string, string | number> | undefined;
      // A timeout shortened by the request budget says nothing about the model.
      let blameModel = true;
      if ('response' in result) {
        try {
          const value = parse(result.response?.output);
          markModelSuccess(model);
          return { value, model };
        } catch (error) {
          if (!(error instanceof UnusableOutputError)) throw error;
          lastReason = 'output'; lastOutputError = error;
          failure = { reason: 'output' };
        }
      } else if (result.timedOut) {
        lastReason = 'timeout';
        failure = { reason: 'timeout' };
        blameModel = timeoutMs >= STEP_TIMEOUT_MS[step];
      } else if (isSchemaValidationError(result.error)) {
        // Genkit validates structured output inside ai.generate; a mismatch is
        // unusable output, so the step keeps its own public error.
        lastReason = 'output';
        lastOutputError = stepOutputError(parse);
        failure = { reason: 'output' };
      } else {
        const status = providerStatus(result.error);
        if (!status) {
          // No provider status: network failure or an SDK error before the
          // HTTP call. Another model may well succeed.
          lastReason = 'network';
          failure = { reason: 'network', errorName: errorName(result.error) };
        } else {
          // Statuses outside the set (auth, permission) fail the same on every model.
          if (!FALLBACK_STATUSES.has(status)) throw result.error;
          lastReason = 'provider';
          const http = httpStatus(result.error);
          failure = { reason: 'provider', providerStatus: status, ...(http ? { httpStatus: http } : {}) };
        }
      }
      if (blameModel) markModelFailure(model);
      log('attempt-failed', { model, step, attemptMs: Date.now() - attemptStarted, ...failure });
      const next = chain[index + 1];
      if (!next) break;
      if (remaining() < MIN_FALLBACK_REMAINING_MS) {
        log('fallback-skipped', { model, step, remainingMs: Math.max(0, remaining()) });
        break;
      }
      index++;
      log('model-fallback', { fromModel: model, toModel: next, step });
      try { options.onFallback?.(model, next, callCount); } catch { /* Observability cannot change generation. */ }
    }
    throw exhausted();
  }

  return {
    run,
    get callCount() { return callCount; },
    get model() { return chain[index]; },
  };
}
export type ModelRunner = ReturnType<typeof createModelRunner>;
