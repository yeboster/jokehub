# api/jokes/top

## Overview
Route handler for `GET /api/jokes/top`. A server-to-server endpoint that returns top-rated jokes through `fetchTopJokes` (`@/services/server/topJokes`). Source: `route.ts`.

## Interface
- `GET(request: NextRequest)` in `route.ts`.
  - Auth: `verifyApiToken(request)` from `@/lib/auth`. On failure it returns `{ error }` with `authResult.status ?? 401`.
  - Query params:
    - `limit`: parsed with `Number.parseInt`. Defaults to `DEFAULT_LIMIT = 10`, clamped to `[1, MAX_LIMIT = 50]`.
    - `minRating`: parsed with `Number.parseFloat`. Defaults to `DEFAULT_MIN_RATING = 4`, clamped to `[0, 5]`.
  - `200` returns `{ jokes, query: { limit, minRating }, count: jokes.length }`.
  - `500` returns `{ error, details }` when the error message contains `'requires an index'`. Any other error returns `500` with `{ error: err.message }`.
- `clampParam(raw, fallback, min, max, parse)` is module-private. A missing or non-finite value falls back to `fallback`, and the result is then clamped.

## Invariants
- Only callers with the shared API token are accepted (`verifyApiToken`).
- `limit` and `minRating` passed to `fetchTopJokes` are always finite and within their clamp ranges. As the comment in `route.ts` says, the clamp stops `NaN` from reaching Firestore `limit()` and stops oversized limits from being honored.

## Side Effects
- Firestore read through `fetchTopJokes({ limit, minRating })`, which is outside this subtree.
- Logs to `console.error` on failure.

## Verification
- No colocated test file in this directory. Run the full suite: `npm test`
