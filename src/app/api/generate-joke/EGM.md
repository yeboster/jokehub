# api/generate-joke

## Overview
Route handler for `POST /api/generate-joke`. It validates the request, loads server exemplars and an optional per-user taste profile, and runs the `generateJoke` Genkit flow (`@/ai/flows/generate-joke-flow`). It responds with either a single JSON body or an NDJSON progress stream. Source: `route.ts`.

## Interface
- `maxDuration = 120` (exported route segment config). The source comment says the flow budget is 90 s.
- `POST(request: NextRequest)` in `route.ts`.
  - Auth: `verifyRequestAuth(request)`. On failure it returns `{ error }` with `authResult.status ?? 401`.
  - Body (`ApiInputSchema`, zod; every field is optional):
    - `topicHint`: string, at most `JOKE_GENERATION_LIMITS.topicHintChars` characters.
    - `prefilledJokes`, `exemplarJokes`, `recentGeneratedJokes`: arrays of `ContextTextSchema`, each capped by its `JOKE_GENERATION_LIMITS.*` entry. `ContextTextSchema` caps each text at `JOKE_GENERATION_LIMITS.contextTextChars` and rejects text that is empty after `normalizeJokeKey`.
    - `model`: must satisfy `resolveModelId(value) !== null`.
    - `temperature`: finite number in `[0, 2]`.
    - `useServerExemplars`: boolean.
    - `mode`: one of `JOKE_MODES`.
    - `count`: integer in `[JOKE_GENERATION_LIMITS.minCount, maxCount]`.
    - `useTasteProfile`: boolean.
  - Every response carries an `x-request-id` header, a fresh `randomUUID()`.
  - Without `Accept: application/x-ndjson`: `200` returns the flow output as JSON.
  - With `Accept: application/x-ndjson`: returns an `application/x-ndjson; charset=utf-8` stream of `GenerationFrame` lines (`@/lib/generationProgress`), with the extra headers `Cache-Control: no-cache, no-transform` and `X-Accel-Buffering: no`:
    - `progress`, with `requestId`, `elapsedMs`, `stage`, `callCount` and `model`
    - `heartbeat`, every 5000 ms, with `requestId` and `elapsedMs`
    - `result`, with `requestId` and `output`
    - `error`, with `requestId`, `error` and `code`
  - Other responses:

    | Status | Body | Condition |
    | --- | --- | --- |
    | `400` | `{ error: 'Invalid input' }` | Body is not valid JSON |
    | `400` | `{ error: 'Invalid input', details }` | Body fails the schema check |
    | `429` | `{ error }` plus a `Retry-After` header | Rate limit exceeded |
    | `500` | `{ error }` | Error outside the NDJSON stream |

- Module-private helpers:
  - `publicFailure(error)`: maps the error message through the `PUBLIC_GENERATION_ERRORS` allowlist. Anything else becomes `'Could not generate jokes. Please try again.'` with code `GENERATION_FAILED`.
  - `sanitizeTasteProfile` and `cleanExamples`: clean a stored taste profile before use.
  - `RATE_LIMIT = { limit: 10, windowMs: 5 * 60_000 }`.

## Invariants
- Error text sent to clients is limited to the allowlist in `publicFailure`. The source comment says provider errors may contain prompts or credentials.
- Callers whose `via` is not `'api-token'` are rate-limited under the key scope `'generate-joke'`.
- A taste profile is loaded only when `authResult.via === 'id-token'` and `useTasteProfile !== false`.
- Taste-profile loading never fails the request. Any error is logged as `taste-unavailable` and generation continues without taste.
- Stored taste data is treated as untrusted. `sanitizeTasteProfile` drops invalid texts and enforces the `JOKE_GENERATION_LIMITS.taste*` caps.
- Server exemplars are fetched unless `useServerExemplars === false`.
- Client and server exemplars are merged with `mergeUniqueJokeTexts`. They are not repeated in `prefilledJokes`.
- `allowRepair` is enabled only when `process.env.JOKEHUB_ENABLE_JOKE_REPAIR === 'true'`.
- A client disconnect (`request.signal` abort, or stream `cancel`) aborts the flow through an `AbortController` and clears the heartbeat interval.
- The model defaults to `DEFAULT_GENERATE_MODEL` when `resolveModelId(input.model)` returns null.

## Side Effects
- Paid AI calls through `generateJoke(...)`.
- Firestore reads through `fetchJokeExemplars`, `fetchAvoidExamples` and `fetchLibraryJokeTexts` (`@/services/server/jokeExemplars`), and through `loadTasteProfile` (`@/services/server/tasteStore`).
- Structured logs to `console.info` and `console.error` under the `[joke-generation]` tag. Records carry `requestId`, stage, model, call count and timings.
- Updates in-memory rate-limit state (`@/lib/rateLimit`).

## Verification
- Focused: `npm test -- src/app/api/generate-joke/route.test.ts`
- Focused: `npm test -- src/app/api/generate-joke/route.integration.test.ts` (keeps the real route, flow and prompts; mocks `@/ai/ai-instance`, auth, rate limit, taste store and exemplars)
- Full: `npm test`
