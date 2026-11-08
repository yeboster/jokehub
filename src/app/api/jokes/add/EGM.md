# api/jokes/add

## Overview
Route handler for `POST /api/jokes/add`. A server-to-server endpoint for adding one joke through the Firebase Admin SDK on behalf of the configured "Jarvis" user. Source: `route.ts`.

## Interface
- `POST(request: NextRequest)` in `route.ts`.
  - Auth: `verifyApiToken(request)` from `@/lib/auth`. On failure it returns `{ error }` with `authResult.status ?? 401`.
  - Body (`AddJokeSchema`, zod): `text: string (min 1)`, `category: string (min 1)`, `source?: string`.
  - `201` returns `{ id, text, category }`.
  - `400` returns `{ error: 'Invalid input', details }` when the schema check fails.
  - `500` returns `{ error }` when `JOKEHUB_JARVIS_USER_ID` is unset or the write throws.

## Invariants
- Only callers with the shared API token are accepted (`verifyApiToken`). Firebase ID tokens are not accepted here.
- The joke's `userId` always comes from `process.env.JOKEHUB_JARVIS_USER_ID`, never from the request. When that variable is unset, the route returns `500` and writes nothing.
- New documents start with `funnyRate: 0`, `averageRating: 0`, `ratingCount: 0`, `ratingSum: 0`, `used: false`, `dateAdded: FieldValue.serverTimestamp()`, and `keywords` from `generateKeywords(text)` (`@/lib/text`).
- When `source` is omitted or empty, it defaults to `'Jarvis AI'`.

## Side Effects
- Firestore write: `adminDb.collection('jokes').doc().set(...)` creates a new `jokes/{autoId}` document. The Admin SDK bypasses security rules, as the comment in `route.ts` notes.
- Logs to `console.error` when the env var is missing or the write fails.

## Verification
- No colocated test file in this directory. Run the full suite: `npm test`
