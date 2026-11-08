# api/explain-joke

## Overview
Route handler for `POST /api/explain-joke`. It streams an AI explanation of a stored joke from the `explainJoke` Genkit flow (`@/ai/flows/explain-joke-flow`), then saves the full explanation on the joke document. Source: `route.ts`.

## Interface
- `POST(request: NextRequest)` in `route.ts`.
  - Auth: `verifyRequestAuth(request)` from `@/lib/auth`, which accepts either the shared API token or a Firebase ID token. On failure it returns `{ error }` with `authResult.status ?? 401`.
  - Body (`ExplainJokeInputSchema`, zod): `{ jokeId: string (min 1) }`. No other input is accepted.
  - `200` returns a `text/plain; charset=utf-8` stream of explanation chunks, with header `X-Content-Type-Options: nosniff`.
  - Error responses:

    | Status | Body | Condition |
    | --- | --- | --- |
    | `400` | `{ error: 'Invalid input', details }` | Body fails the schema check |
    | `404` | `{ error: 'Joke not found' }` | No document for `jokeId` |
    | `422` | `{ error: 'Joke has no text to explain' }` | Stored `text` is missing or blank |
    | `429` | `{ error }` plus a `Retry-After` header | Rate limit exceeded |
    | `500` | `{ error: <message> }` | Any other thrown error |

- `RATE_LIMIT = { limit: 20, windowMs: 5 * 60_000 }` is module-private.

## Invariants
- The explained text is always read from Firestore (`jokes/{jokeId}.text`), never taken from the request.
- There is deliberately no ownership check: any authenticated caller may request an explanation for any joke. The comment in `route.ts` gives the reasons and cites audit §1.3.
- Callers whose `authResult.via` is not `'api-token'` are rate-limited with `rateLimit(rateLimitKeyFor(request, 'explain-joke', userId), RATE_LIMIT)`. API-token callers are exempt.
- The route checks that the joke exists before it generates or writes anything.
- The explanation is saved with `jokeRef.update` (not `set`), so a joke deleted mid-stream is not recreated. It is saved only when the trimmed full explanation is non-empty.
- A failed save is logged with `console.warn` and does not fail the stream.

## Side Effects
- Firestore read: `adminDb.collection('jokes').doc(jokeId).get()`.
- Firestore write: `jokeRef.update({ explanation })` through the Admin SDK, which bypasses security rules.
- One paid AI call per request: `explainJoke({ jokeText })`.
- Updates in-memory rate-limit state (`@/lib/rateLimit`).
- Logs with `console.warn` and `console.error`.

## Verification
- No colocated test file in this directory. Run the full suite: `npm test`
