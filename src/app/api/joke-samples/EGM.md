# api/joke-samples

## Overview
CRUD route handlers for `/api/joke-samples`, which manage the signed-in user's own joke samples. They wrap the taste-store sample functions in `@/services/server/tasteStore`. Source: `route.ts`.

## Interface
Every handler authenticates with `requireUser(request, 'joke-samples')` from `@/lib/userRouteGuard`.

| Handler | Input | Success response | Error responses |
| --- | --- | --- | --- |
| `GET` | None | `{ samples }` from `listSamples(uid)` | Auth errors from `requireUser` |
| `POST` | Body: `SampleCreateSchema` | `{ sample, created }` from `createSample(uid, data)`. Status `201` when `created`, otherwise `200` | `400` invalid input; `409` with `error.message` and `error.code` when `SampleLimitError` is thrown |
| `PATCH` | Body: `SampleUpdateSchema` | `{ sample }` from `updateSample(uid, data)` | `400` invalid input; `404` with `'Sample not found'` and code `NOT_FOUND` when no sample is returned |
| `DELETE` | Query `id`, validated with `TasteDocIdSchema` | `{ deleted }` from `deleteSample(uid, id)` | `400` invalid input |

- The schemas come from `@/lib/tasteProfile`.
- Any other error in a handler returns `internalError('joke-samples', <METHOD>, error)`.

## Invariants
- Only Firebase ID-token users are accepted. `requireUser` returns `403` with `USER_REQUIRED` for API-token callers and rate-limits per user under scope `'joke-samples'`.
- Each operation is scoped to the authenticated `uid`. No handler takes a user id from the request.
- Invalid input always returns `invalidInput()` (`400`, code `INVALID_INPUT`).
- Responses go through `jsonResponse` or `errorResponse`, which set `Cache-Control: no-store`.

## Side Effects
- Firestore reads and writes through `listSamples`, `createSample`, `updateSample` and `deleteSample`, which are outside this subtree.
- Updates in-memory rate-limit state through `requireUser`.

## Verification
- Focused: `npm test -- src/app/api/joke-samples/route.test.ts`
- Full: `npm test`
