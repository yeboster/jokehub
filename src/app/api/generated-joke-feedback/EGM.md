# api/generated-joke-feedback

## Overview
Route handlers for `/api/generated-joke-feedback`. They record and manage per-user feedback on generated jokes: votes, reasons and saves. The doc comment in `route.ts` says the store holds one record per user and joke text in `generatedJokeFeedback`, through `@/services/server/tasteStore`. Source: `route.ts`.

## Interface
- `POST(request: NextRequest)`:
  - Auth: `verifyRequestAuth`. It requires `success` and a `userId`, and accepts both API-token and ID-token callers. On failure it returns `{ error }` with `authResult.status ?? 401`.
  - Body: `FeedbackUpsertSchema` (`@/lib/tasteProfile`).
  - `200` returns `{ ok: true, feedback }` from `upsertFeedback(userId, data)`.
  - Errors: `400` returns `{ error: 'Invalid input', code: 'INVALID_INPUT' }`. `429` returns `{ error }` with a `Retry-After` header. `500` returns `{ error: 'Could not save feedback. Please try again.', code: 'INTERNAL_ERROR' }`.
- `GET(request: NextRequest)`:
  - Auth: `requireUser(request, 'taste-feedback')` from `@/lib/userRouteGuard`.
  - Query `limit`: 1 to 3 digits, within `[1, TASTE_LIMITS.feedbackPage]`. Defaults to `TASTE_LIMITS.feedbackPage`. Any other value returns `invalidInput()` (`400`).
  - Returns `jsonResponse(await summarizeFeedback(uid, limit))`.
- `DELETE(request: NextRequest)`:
  - Auth: `requireUser(request, 'taste-feedback')`.
  - Returns `jsonResponse({ deleted: await clearFeedback(uid) })`.
- Module-private:
  - `parseLimit(value)`.
  - `RATE_LIMIT = { limit: 60, windowMs: 5 * 60_000 }`, used by POST.
  - `MANAGE_SCOPE = 'taste-feedback'`.

## Invariants
- GET and DELETE accept only Firebase ID-token users. `requireUser` returns `403` with `USER_REQUIRED` when `via !== 'id-token'`, applies its own rate limit, and sends `Cache-Control: no-store` through `jsonResponse`.
- POST keeps its original contract, so API-token callers are allowed (doc comment in `route.ts`). It writes under `authResult.userId`, which for API-token callers is always `'api-user'`, so all API-token feedback is stored under that id. Only callers whose `via` is not `'api-token'` are rate-limited, under the key scope `'generated-joke-feedback'`.
- The POST error log records only `error.name`, never the request content.
- When GET or DELETE throws, the handler returns `internalError(MANAGE_SCOPE, <METHOD>, error)` (`@/lib/userRouteGuard`): `500` with `{ error: 'Something went wrong. Please try again.', code: 'INTERNAL_ERROR' }`.
- A comment on the GET handler says the summary counts cover every record read (up to 500), not only the returned page.

## Side Effects
- Firestore writes and reads through `upsertFeedback`, `summarizeFeedback` and `clearFeedback` (`@/services/server/tasteStore`). DELETE removes all of the user's feedback records.
- Updates in-memory rate-limit state.
- Logs to `console.error` when a POST write fails (`[generated-joke-feedback]`), and when GET or DELETE fails (`[taste-api]`, through `internalError`).

## Verification
- Focused: `npm test -- src/app/api/generated-joke-feedback/route.test.ts`
- Full: `npm test`
