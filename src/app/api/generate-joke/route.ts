import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { generateJoke, type GenerateJokeInput } from '@/ai/flows/generate-joke-flow';
import { PUBLIC_GENERATION_ERRORS } from '@/ai/flows/generation-errors';
import { DEFAULT_GENERATE_MODEL, resolveModelId } from '@/ai/models';
import { fetchAvoidExamples, fetchJokeExemplars, fetchLibraryJokeTexts } from '@/services/server/jokeExemplars';
import { loadTasteProfile } from '@/services/server/tasteStore';
import { JOKE_GENERATION_LIMITS, JOKE_MODES, mergeUniqueJokeTexts, normalizeJokeKey } from '@/lib/jokeGenerationContract';
import { isEmptyTasteProfile, type TasteExample, type TasteProfile } from '@/lib/tasteProfile';
import type { GenerationFrame, GenerationProgress, GenerationStage } from '@/lib/generationProgress';
import { verifyRequestAuth } from '@/lib/auth';
import { rateLimit, rateLimitKeyFor } from '@/lib/rateLimit';
import { z } from 'zod';

/** Seconds the hosting platform may keep this route alive; the flow budget is 90 s. */
export const maxDuration = 120;

const RATE_LIMIT = { limit: 10, windowMs: 5 * 60_000 };
const ContextTextSchema = z.string().max(JOKE_GENERATION_LIMITS.contextTextChars)
  .refine(text => !!normalizeJokeKey(text), 'Context text must not be empty.');
const ApiInputSchema = z.object({
  topicHint: z.string().max(JOKE_GENERATION_LIMITS.topicHintChars).optional(),
  prefilledJokes: z.array(ContextTextSchema).max(JOKE_GENERATION_LIMITS.prefilledJokes).optional(),
  exemplarJokes: z.array(ContextTextSchema).max(JOKE_GENERATION_LIMITS.exemplarJokes).optional(),
  recentGeneratedJokes: z.array(ContextTextSchema).max(JOKE_GENERATION_LIMITS.recentGeneratedJokes).optional(),
  /** Catalog id or legacy alias; resolved before generation. */
  model: z.string().refine(value => resolveModelId(value) !== null, 'Unsupported model.').optional(),
  temperature: z.number().finite().min(0).max(2).optional(),
  useServerExemplars: z.boolean().optional(),
  mode: z.enum(JOKE_MODES).optional(),
  count: z.number().int().min(JOKE_GENERATION_LIMITS.minCount).max(JOKE_GENERATION_LIMITS.maxCount).optional(),
  useTasteProfile: z.boolean().optional(),
});

// Allowlisted messages only: provider errors may contain prompts or credentials.
function publicFailure(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  return Object.hasOwn(PUBLIC_GENERATION_ERRORS, message) ? { error: message, code: PUBLIC_GENERATION_ERRORS[message] }
    : { error: 'Could not generate jokes. Please try again.', code: 'GENERATION_FAILED' };
}

const validText = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= JOKE_GENERATION_LIMITS.contextTextChars && !!normalizeJokeKey(value);

function cleanExamples(items: unknown, cap: number): TasteExample[] {
  if (!Array.isArray(items)) return [];
  return items.flatMap(item => {
    const { text, reason } = (item ?? {}) as { text?: unknown; reason?: unknown };
    if (!validText(text)) return [];
    const trimmed = typeof reason === 'string' ? reason.trim().slice(0, JOKE_GENERATION_LIMITS.tasteReasonChars) : '';
    return [trimmed ? { text, reason: trimmed } : { text }];
  }).slice(0, cap);
}

/** Store data is untrusted here: drop invalid texts and enforce the caps the flow validates. */
function sanitizeTasteProfile(profile: unknown): TasteProfile | undefined {
  const raw = (profile ?? {}) as { samples?: unknown; liked?: unknown; disliked?: unknown };
  const clean: TasteProfile = {
    samples: (Array.isArray(raw.samples) ? raw.samples.filter(validText) : []).slice(0, JOKE_GENERATION_LIMITS.tasteSamples),
    liked: cleanExamples(raw.liked, JOKE_GENERATION_LIMITS.tasteLiked),
    disliked: cleanExamples(raw.disliked, JOKE_GENERATION_LIMITS.tasteDisliked),
  };
  return isEmptyTasteProfile(clean) ? undefined : clean;
}

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  const started = Date.now();
  const headers = { 'x-request-id': requestId };
  let stage: GenerationStage = 'examples';
  let stageStarted = started;
  let callCount = 0;
  let model: string = DEFAULT_GENERATE_MODEL;
  const log = (event: string, extra: Record<string, unknown> = {}, failed = false) => {
    const record = { event, requestId, stage, model, callCount, elapsedMs: Date.now() - started, stageDurationMs: Date.now() - stageStarted, ...extra };
    if (failed) console.error('[joke-generation]', record);
    else console.info('[joke-generation]', record);
  };
  try {
    const authResult = await verifyRequestAuth(request);
    if (!authResult.success) {
      log('rejected', { code: 'AUTH_REQUIRED' });
      return NextResponse.json({ error: authResult.error ?? 'Unauthorized' }, { status: authResult.status ?? 401, headers });
    }
    if (authResult.via !== 'api-token') {
      const { allowed, retryAfterSeconds } = rateLimit(rateLimitKeyFor(request, 'generate-joke', authResult.userId), RATE_LIMIT);
      if (!allowed) {
        log('rejected', { code: 'RATE_LIMITED' });
        return NextResponse.json({ error: 'Too many generation requests. Please try again shortly.' }, { status: 429, headers: { ...headers, 'Retry-After': String(retryAfterSeconds) } });
      }
    }
    let body: unknown;
    try { body = await request.json(); } catch {
      log('rejected', { code: 'INVALID_JSON' });
      return NextResponse.json({ error: 'Invalid input' }, { status: 400, headers });
    }
    const parsedInput = ApiInputSchema.safeParse(body);
    if (!parsedInput.success) {
      log('rejected', { code: 'INVALID_INPUT' });
      return NextResponse.json({ error: 'Invalid input', details: parsedInput.error.format() }, { status: 400, headers });
    }
    const input = parsedInput.data;
    const selectedModel = resolveModelId(input.model) ?? DEFAULT_GENERATE_MODEL;
    model = selectedModel;
    const userId = authResult.via === 'id-token' && input.useTasteProfile !== false ? authResult.userId : undefined;
    const allowRepair = process.env.JOKEHUB_ENABLE_JOKE_REPAIR === 'true';
    const lifecycle = new AbortController();
    if (request.signal.aborted) lifecycle.abort();
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    const disconnect = () => { lifecycle.abort(); clearInterval(heartbeat); log('client-disconnected'); };
    request.signal.addEventListener('abort', disconnect, { once: true });
    const run = async (send: (frame: GenerationFrame) => void) => {
      const progress = (event: GenerationProgress) => {
        log('stage-finished');
        stage = event.stage; callCount = event.callCount; stageStarted = Date.now();
        if (event.model) model = event.model;
        log('stage-started');
        send({ type: 'progress', requestId, elapsedMs: Date.now() - started, ...event });
      };
      // Flow events carry model ids, statuses and counts only.
      const flowLog = (event: string, fields: Record<string, string | number>) => log(event, fields, event === 'attempt-failed');
      log('started', { allowRepair, requestedCount: input.count ?? JOKE_GENERATION_LIMITS.defaultCount });
      send({ type: 'progress', requestId, stage: 'examples', callCount: 0, elapsedMs: Date.now() - started, model });
      const useServer = input.useServerExemplars !== false;
      // Taste never fails the request: any error yields no taste profile.
      const tasteLoad: Promise<TasteProfile | undefined> = userId
        ? Promise.resolve().then(() => loadTasteProfile(userId)).then(sanitizeTasteProfile).catch(() => { log('taste-unavailable'); return undefined; })
        : Promise.resolve(undefined);
      const [[serverExemplars, avoidJokes, libraryJokes], taste] = useServer || userId ? await Promise.all([
        useServer ? Promise.all([fetchJokeExemplars(), fetchAvoidExamples(), fetchLibraryJokeTexts()]) : Promise.resolve([[], [], []] as string[][]),
        tasteLoad,
      ]) : [[[], [], []] as string[][], undefined];
      if (taste) log('taste-loaded', { samples: taste.samples.length, liked: taste.liked.length, disliked: taste.disliked.length });
      if (lifecycle.signal.aborted) throw new Error('Request disconnected');
      // Exemplars already count as copy references in the flow; listing them as
      // prefilled too would repeat every example in the prompt.
      const aiInput: GenerateJokeInput = {
        topicHint: input.topicHint, model: selectedModel, temperature: input.temperature,
        prefilledJokes: mergeUniqueJokeTexts(input.prefilledJokes ?? [], [], JOKE_GENERATION_LIMITS.prefilledJokes),
        exemplarJokes: mergeUniqueJokeTexts(input.exemplarJokes ?? [], serverExemplars, JOKE_GENERATION_LIMITS.exemplarJokes),
        recentGeneratedJokes: input.recentGeneratedJokes,
        avoidJokes, mode: input.mode, libraryJokes,
        ...(input.count !== undefined ? { count: input.count } : {}),
        ...(taste ? { taste } : {}),
      };
      const output = await generateJoke(aiInput, { allowRepair, onProgress: progress, signal: lifecycle.signal, onLog: flowLog, startedAt: started });
      log('completed');
      return output;
    };
    if (!request.headers.get('accept')?.includes('application/x-ndjson')) {
      // Log the same true flow boundaries without changing the JSON response contract.
      try {
        const output = await run(() => {});
        return NextResponse.json(output, { status: 200, headers });
      } finally { request.signal.removeEventListener('abort', disconnect); }
    }
    const encoder = new TextEncoder();
    let disconnected = false;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (frame: GenerationFrame) => {
          if (disconnected || lifecycle.signal.aborted) return;
          try { controller.enqueue(encoder.encode(JSON.stringify(frame) + '\n')); } catch { disconnected = true; }
        };
        heartbeat = setInterval(() => send({ type: 'heartbeat', requestId, elapsedMs: Date.now() - started }), 5000);
        try {
          const output = await run(send);
          send({ type: 'result', requestId, output });
        } catch (error) {
          const failure = publicFailure(error);
          log('failed', { code: failure.code }, true);
          send({ type: 'error', requestId, ...failure });
        } finally {
          clearInterval(heartbeat);
          request.signal.removeEventListener('abort', disconnect);
          if (!disconnected) { try { controller.close(); } catch { /* Reader already closed. */ } }
        }
      },
      cancel() { disconnected = true; disconnect(); },
    });
    return new Response(stream, { headers: { ...headers, 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' } });
  } catch (error) {
    const failure = publicFailure(error);
    log('failed', { code: failure.code }, true);
    return NextResponse.json({ error: failure.error }, { status: 500, headers });
  }
}
