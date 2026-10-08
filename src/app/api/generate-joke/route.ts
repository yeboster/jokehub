import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { generateJoke, type GenerateJokeInput } from '@/ai/flows/generate-joke-flow';
import { DEFAULT_GENERATE_MODEL, GEMINI_MODELS } from '@/ai/models';
import { fetchJokeExemplars } from '@/services/server/jokeExemplars';
import { JOKE_GENERATION_LIMITS, mergeUniqueJokeTexts, normalizeJokeKey } from '@/lib/jokeGenerationContract';
import type { GenerationFrame, GenerationProgress, GenerationStage } from '@/lib/generationProgress';
import { verifyRequestAuth } from '@/lib/auth';
import { rateLimit, rateLimitKeyFor } from '@/lib/rateLimit';
import { z } from 'zod';

const RATE_LIMIT = { limit: 10, windowMs: 5 * 60_000 };
const ContextTextSchema = z.string().max(JOKE_GENERATION_LIMITS.contextTextChars)
  .refine(text => !!normalizeJokeKey(text), 'Context text must not be empty.');
const ApiInputSchema = z.object({
  topicHint: z.string().max(JOKE_GENERATION_LIMITS.topicHintChars).optional(),
  prefilledJokes: z.array(ContextTextSchema).max(JOKE_GENERATION_LIMITS.prefilledJokes).optional(),
  exemplarJokes: z.array(ContextTextSchema).max(JOKE_GENERATION_LIMITS.exemplarJokes).optional(),
  recentGeneratedJokes: z.array(ContextTextSchema).max(JOKE_GENERATION_LIMITS.recentGeneratedJokes).optional(),
  model: z.enum(GEMINI_MODELS).optional(),
  temperature: z.number().finite().min(0).max(2).optional(),
  useServerExemplars: z.boolean().optional(),
});

// Allowlisted messages only: provider errors may contain prompts or credentials.
function publicFailure(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  const known: Record<string, string> = {
    'Joke quality check failed. Please try again.': 'QUALITY_CHECK_FAILED',
    'Could not produce three eligible, unique jokes. Please try again.': 'INSUFFICIENT_JOKES',
    'AI failed to generate joke candidates. The output was empty.': 'EMPTY_CANDIDATES',
    'AI returned candidate data in an unexpected format.': 'INVALID_CANDIDATES',
  };
  return Object.hasOwn(known, message) ? { error: message, code: known[message] }
    : { error: 'Could not generate jokes. Please try again.', code: 'GENERATION_FAILED' };
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
    model = input.model ?? DEFAULT_GENERATE_MODEL;
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
        log('stage-started');
        send({ type: 'progress', requestId, elapsedMs: Date.now() - started, ...event });
      };
      log('started', { allowRepair });
      send({ type: 'progress', requestId, stage: 'examples', callCount: 0, elapsedMs: Date.now() - started });
      const serverExemplars = input.useServerExemplars !== false ? await fetchJokeExemplars() : [];
      if (lifecycle.signal.aborted) throw new Error('Request disconnected');
      const aiInput: GenerateJokeInput = {
        topicHint: input.topicHint, model: input.model, temperature: input.temperature,
        prefilledJokes: mergeUniqueJokeTexts(input.prefilledJokes ?? [], serverExemplars, JOKE_GENERATION_LIMITS.prefilledJokes),
        exemplarJokes: mergeUniqueJokeTexts(input.exemplarJokes ?? [], serverExemplars, JOKE_GENERATION_LIMITS.exemplarJokes),
        recentGeneratedJokes: input.recentGeneratedJokes,
      };
      const output = await generateJoke(aiInput, { allowRepair, onProgress: progress, signal: lifecycle.signal });
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
