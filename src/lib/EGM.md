# src/lib

## Overview

Shared TypeScript code for Jokehub, imported through the `@/lib/*` alias. It includes:

- Firebase client and Admin SDK bootstrapping (`firebase.ts`, `admin.ts`).
- Request authentication, in-memory rate limiting, and JSON route-guard helpers for API route handlers (`auth.ts`, `rateLimit.ts`, `userRouteGuard.ts`).
- Zod contracts for joke generation and taste feedback (`jokeGenerationContract.ts`, `tasteProfile.ts`, `studioBatches.ts`) and the NDJSON generation stream reader (`generationProgress.ts`).
- URL-derived feed filter state (`jokeFilters.ts`, `ratingBuckets.ts`, `ratingFilterDegrade.ts`).
- Pure helpers that build UI copy and announcements: feed, CSV import, joke status, motion, star rating, sharing, and site URL.

There are no subdirectories. None of the files has a `'use client'` or `'server-only'` directive. Comments in `userRouteGuard.ts` ("Server-only") and `tasteProfile.ts` ("Client-safe") state each file's intended side of the boundary, but nothing enforces it.

Cross-package dependencies: `jokeFilters.ts` imports the `FilterParams` type from [`src/services/jokeService.ts`](/src/services/jokeService.ts). [`src/hooks/useJokeFilters.ts`](/src/hooks/useJokeFilters.ts) consumes these filters.

## Interface

### Firebase infrastructure
- `firebase.ts`: `app`, `db`, and `auth` are the client SDK `FirebaseApp`, `Firestore`, and `Auth` singletons. They are created when the module is imported.
- `admin.ts`: `adminDb` (`Firestore`) and `adminAuth` (`Auth`) are lazy `Proxy` singletons over `firebase-admin`. `FieldValue` is re-exported from `firebase-admin/firestore`.
- `firestoreErrors.ts`:
  - `isMissingIndexError(error)` reports whether a query failed for lack of a composite index.
  - `warnMissingIndex(context, error)` logs a single warning when that happens.
- `firestoreTimestamps.ts`: `toDate(value)` and `toMillis(value)` read a Firestore `Timestamp` without throwing.
- `types.ts`: interfaces `Joke`, `Category`, and `UserRating`.
- `utils.ts`: `cn(...inputs)` returns `twMerge(clsx(inputs))`.

### API auth and route guards (server route handlers)
- `auth.ts`:
  - `AuthResult` has the fields `success`, `userId?`, `error?`, `status?`, and `via?: 'api-token' | 'id-token'`.
  - `verifyApiToken(request)` accepts only the shared service token.
  - `verifyRequestAuth(request)` accepts the service token or a Firebase ID token.
- `rateLimit.ts`:
  - `rateLimit(key, { limit, windowMs })` returns a `RateLimitResult` (`allowed`, `remaining`, `retryAfterSeconds`).
  - `clientIpFrom(request)` returns the client IP.
  - `rateLimitKeyFor(request, scope, userId?)` builds a rate-limit key.
  - `resetRateLimits()` clears all counters.
  - Also exports the `RateLimitOptions` type.
- `userRouteGuard.ts`:
  - `jsonResponse(body, status = 200, headers)` and `errorResponse(status, error, code, headers)` build JSON responses.
  - `invalidInput()` returns a 400 response.
  - `requireUser(request, scope)` returns `{ uid }` or `{ response }`.
  - `readJson(request)` parses the request body.
  - `internalError(scope, method, error)` returns a 500 response.

### Joke generation and taste contracts
- `jokeGenerationContract.ts`:
  - Constants: `JOKE_GENERATION_LIMITS` and `JOKE_MODES` (`['original', 'classic']`).
  - Types: `JokeMode`, `JokeVariation`, and `GenerationResult`.
  - Schemas: `JokeTextSchema`, `JokeVariationSchema`, and `GenerationResultSchema`.
  - Functions: `normalizeJokeKey`, `mergeUniqueJokeTexts(primary, secondary, cap)`, and `isNearDuplicateJoke(a, b)`.
- `generationProgress.ts`:
  - Constants: `GENERATION_STAGE_LABELS` and `MAX_GENERATION_CALLS` (`10`).
  - Types: `GenerationStage`, `GenerationProgress`, and `GenerationFrame`. A `GenerationFrame` is a `progress`, `heartbeat`, `result`, or `error` frame.
  - `readGenerationStream(body, onFrame)` reads the stream and resolves with the output of the `result` frame.
- `tasteProfile.ts`:
  - Constants: `FEEDBACK_API_PATH` (`'/api/generated-joke-feedback'`), `SAMPLES_API_PATH` (`'/api/joke-samples'`), and `TASTE_LIMITS`.
  - Schemas: `TasteDocIdSchema`, `FeedbackVoteSchema`, `FeedbackUpsertSchema`, `GenerationFeedbackSchema`, `FeedbackCountsSchema`, `SampleCreateSchema`, `SampleUpdateSchema`, and `JokeSampleSchema`. Each has an exported inferred type except `TasteDocIdSchema`; `FeedbackUpsertInput` (`z.input<typeof FeedbackUpsertSchema>`) is also exported.
  - Types: `TasteExample` and `TasteProfile`.
  - Functions: `emptyTasteProfile()` and `isEmptyTasteProfile(profile)`.
- `studioBatches.ts`:
  - Constant: `STUDIO_BATCH_LIMIT` (`5`).
  - Types: `StudioJoke`, `StudioJokeStatus`, `StudioBatch`, and `StorageLike`.
  - Storage functions: `studioBatchesKey(uid)`, `sessionStorageOrNull()`, `readStoredBatches`, `writeStoredBatches`, and `clearAllStoredBatches`.
  - Other functions: `prependBatch`, `recentGeneratedHistory`, and `studioId(prefix)`.

### Feed filters (URL-derived)
- `jokeFilters.ts`:
  - `DEFAULT_FILTERS`.
  - `parseFiltersFromParams(params)` and `filtersToSearchParams(filters)` convert between filters and the query string.
  - `filtersEqual(a, b)` and `hasActiveFilters(filters)` compare filter sets.
  - `FilterChip`, `activeFilterChips(filters)`, and `nextChipFocusKey(chips, removedKey)` support the removable filter chips.
- `ratingBuckets.ts`:
  - Constants: `ANY_RATING` (`-1`) and `UNRATED` (`0`).
  - Types: `RatingRange`, `UnratedBucket`, and `CommunityRatingBucket`.
  - Functions: `isUnratedBucket`, `communityRatingBucket(stars)`, `matchesCommunityRatingBucket(bucket, joke)`, and `ratingBucketLabel(stars)`.
- `ratingFilterDegrade.ts`: `shouldDegradeRatingFilter(error, filters)` decides when to drop the rating filter from the query (see Invariants).
- `text.ts`: `generateKeywords(text)`, `generateSearchTokens(search)`, and `MAX_SEARCH_TOKENS` (`10`).

### UI copy, accessibility, and navigation helpers
- `feedAnnounce.ts`: `FeedCountSnapshot`, `FeedSnapshot`, `describeFeedAppend`, `describeFeedStatus`, and `describeFeedTally`.
- `feedEmptyState.ts`: `FeedEmptyCopy`, `FeedEmptyInput`, `describeEmptyFeed`, and `emptyFeedAnnouncement`.
- `feedReturn.ts`: `FEED_PATH` (`'/jokes'`), `StorageLike`, `rememberFeedUrl(storage, url)`, and `readFeedUrl(storage)`.
- `authRedirect.ts`: `DEFAULT_AUTH_REDIRECT` (`'/jokes'`) and `safeRedirectPath(value: string | null): string`.
- `jokeStatus.ts`: `JOKE_NOT_FOUND_TITLE`, `JOKE_NOT_FOUND_HINT`, `JokeLoadResult`, and `describeJokeLoadResult`.
- `motion.ts`: `STAGGER_STEP_MS` (`40`), `MAX_STAGGERED_ITEMS` (`12`), `entranceDelayMs(index)`, `StaggerBatch`, and `nextStaggerBatch(previous, firstId, count)`.
- `starRating.ts`: `ratingFromKey(key, current, maxStars)` and `tabbableStarIndex(rating, maxStars)`.
- `share.ts`: `ClipboardLike`, `jokeShareUrl(origin, jokeId)`, and `copyToClipboard(text, clipboard?)`.
- `siteUrl.ts`: `DEV_SITE_URL` (`'http://localhost:9002'`), `SiteUrlEnv`, `resolveSiteUrl(env)`, and `SITE_URL`.
- `csv.ts`: `parseCSVLine(line)`.
- `csvReport.ts`: `SkippedRow`, `MAX_REPORTED_ROWS` (`10`), `describeSkippedRows`, `ImportSummary`, and `summarizeImport(importedCount, skipped)`.

## Invariants

### Tailwind boundary
- Comments in `csvReport.ts`, `feedAnnounce.ts`, `feedEmptyState.ts`, `jokeStatus.ts`, `share.ts`, `siteUrl.ts`, `ratingBuckets.ts`, and `starRating.ts` require these files to return only strings, numbers, or booleans. They must never return Tailwind class names, because `src/lib/` is outside the content globs in [`tailwind.config.ts`](/tailwind.config.ts).

### Firebase
- **Client SDK (`firebase.ts`):** importing the module throws if `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, or `NEXT_PUBLIC_FIREBASE_PROJECT_ID` is missing or empty. If an app already exists (`getApps().length`), it is reused.
- **Admin SDK (`admin.ts`):**
  - Credentials come from `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY`.
  - Literal `\n` sequences in the private key are converted to newlines.
  - If any of the three is missing, it throws `'Firebase Admin credentials not configured. Missing: ...'`. The message contains only presence booleans, never the values.
  - `initializeApp` runs only when `getApps().length === 0`.
  - Initialization happens on first property access, not at import.
  - `adminAuth` binds function properties to the real instance. `adminDb` does not bind them.
- **Missing-index detection:** `isMissingIndexError` is true when `code === 'failed-precondition'` or when the message contains `'requires an index'`.
- **Timestamps:** `toDate` and `toMillis` return `new Date(0)` and `0` for any value that is not a `Timestamp`.

### Auth and route guards
- **Header format:** the Bearer header must match `/^Bearer\s+(\S+)$/i` after trimming.
- **Token comparison:** tokens are compared by UTF-8 length first, then with `crypto.timingSafeEqual`.
- **`verifyApiToken` failures:**
  - `JOKEHUB_API_TOKEN` unset: 500 `'Server configuration error'`.
  - No header: 401 `'Missing Authorization header'`.
  - Malformed header: 401 `'Malformed Authorization header'`.
  - Token mismatch: 401 `'Invalid token'`.
- **`verifyApiToken` success:** returns `{ userId: 'api-user', via: 'api-token' }`.
- **`verifyRequestAuth`:**
  - A matching service token returns `api-user` / `api-token`.
  - Otherwise it calls `adminAuth.verifyIdToken` and returns `{ userId: decoded.uid, via: 'id-token' }`.
  - These error codes give 401 `'Invalid or expired credentials'`: `auth/argument-error`, `auth/id-token-expired`, `auth/id-token-revoked`, `auth/invalid-id-token`, `auth/user-disabled`, and `auth/user-not-found`.
  - Every other error gives 500 `'Server configuration error'`.
  - A missing or malformed header returns no `status`, which callers treat as 401.
- **Rate limiter (`rateLimit`):**
  - Each key has a fixed window that starts at its first request.
  - Denied requests still increment the count.
  - The first request in a window returns `retryAfterSeconds = Math.ceil(windowMs / 1000)`. Later requests return at least 1.
  - Expired windows are pruned on every call.
- **Client IP (`clientIpFrom`):** the first hop of `x-forwarded-for`, then `x-real-ip`, then `'unknown'`.
- **Rate-limit keys (`rateLimitKeyFor`):** `${scope}:user:${userId}` when a user ID is given, otherwise `${scope}:ip:${ip}`.
- **Response headers:** `jsonResponse` always sets `Cache-Control: no-store`, though caller headers can override it.
- **`requireUser`:**
  - Rate limit: `RATE_LIMIT = { limit: 60, windowMs: 60_000 }` per key.
  - Auth failure: `auth.status ?? 401` with code `AUTH_REQUIRED`.
  - A non-`id-token` caller, or no `userId`: 403 `USER_REQUIRED`.
  - Over the rate limit: 429 `RATE_LIMITED` with a `Retry-After` header.
- **Other guard responses:**
  - `invalidInput` returns 400 `INVALID_INPUT`.
  - `internalError` returns 500 `INTERNAL_ERROR` with a generic message.
  - `readJson` returns `undefined` when the body is not valid JSON.

### Generation contracts
- **Limits:** `JOKE_GENERATION_LIMITS` sets `topicHintChars: 500`, `contextTextChars: 2000`, `prefilledJokes: 25`, `exemplarJokes: 25`, `recentGeneratedJokes: 12`, `avoidJokes: 8`, `libraryJokes: 1000`, `minCount: 1`, `maxCount: 5`, `defaultCount: 3`, `tasteSamples: 10`, `tasteLiked: 10`, `tasteDisliked: 10`, and `tasteReasonChars: 200`.
- **Schemas:**
  - `JokeTextSchema` allows at most 2000 characters and must not normalize to an empty key.
  - `JokeVariationSchema.category` must contain non-whitespace.
  - `GenerationResultSchema` requires 1–5 jokes, a non-empty `model`, and an integer `requestedCount` from 1 to 5.
- **Normalization:** `normalizeJokeKey` applies NFKC and lowercase, strips everything except letters, numbers, marks, and whitespace, collapses whitespace, and trims.
- **Merging:** `mergeUniqueJokeTexts` reads `primary` then `secondary` and stops at `cap`. It keeps the first occurrence of each normalized key, skips texts whose normalized key is empty, and does not validate input bounds.
- **Near-duplicates (`isNearDuplicateJoke`):**
  - If either normalized key is empty, the result is false (two texts that both normalize to `''` are not duplicates).
  - Otherwise equal keys are duplicates.
  - Otherwise stopwords are removed. If either side has fewer than 3 remaining words (`NEAR_DUPLICATE_MIN_WORDS`), the result is false.
  - Otherwise the result is a Jaccard similarity of at least 0.6 (`NEAR_DUPLICATE_SIMILARITY`).
- **Stream format (`readGenerationStream`):**
  - The body is NDJSON, one frame per `\n`-delimited line. Blank lines are skipped.
  - Every frame needs a non-empty `requestId` that matches the first frame's.
  - No frame may follow the `result` frame.
  - A `progress` frame needs a known stage, a finite `elapsedMs >= 0`, an integer `callCount` from 0 to `MAX_GENERATION_CALLS`, and a string `model` when `model` is present.
  - An `error` frame needs string `error` and `code` fields. A `heartbeat` frame needs a finite `elapsedMs >= 0`.
  - A frame `type` other than `progress`, `heartbeat`, `error` or `result` is rejected.
- **Stream handling (`readGenerationStream`):**
  - `onFrame` runs before error or result handling.
  - An `error` frame throws `frame.error`.
  - If no `result` frame arrives, it throws `'Generation connection interrupted. Please try again.'`.
  - Frames and chunks have no size cap, on purpose.
  - The `finally` block always cancels the reader and releases its lock.
- **Taste schemas:**
  - `TASTE_LIMITS` sets `maxSamples: 50`, `feedbackPage: 100`, `noteChars: 200`, `reasonChars: JOKE_GENERATION_LIMITS.tasteReasonChars` (200), `categoryChars: 100`, and `modelChars: 100`.
  - `TasteDocIdSchema` is `/^[a-f0-9]{32}$/`.
  - In `FeedbackUpsertSchema`, the vote `'none'` becomes `null`.
- **Stored studio batches:**
  - `readStoredBatches` returns `[]` on a missing value, a parse failure, a validation failure, or any thrown error.
  - It keeps the first `STUDIO_BATCH_LIMIT` batches and resets status `'saving'` to `'idle'`.
  - `prependBatch` also caps the list at 5.
  - `recentGeneratedHistory` is capped at `recentGeneratedJokes`.
  - Storage write and clear errors are swallowed.
  - `clearAllStoredBatches` removes every key with the prefix `jokehub:studio-batches:`.

### Feed filters
- **Parsing (`parseFiltersFromParams`):**
  - `categories` is read from repeated `categories` params. Values are trimmed, with empty values and duplicates dropped, and comma-joined values are not split.
  - `funnyRate` is accepted only from -1 to 5; anything else becomes `ANY_RATING`.
  - `scope` is `'user'` only when the param is exactly `'user'`; otherwise it is `'public'`.
  - `usageStatus` must be `all`, `used`, or `unused`.
  - `search` is not trimmed.
  - `limit` is never parsed, and `scope` is not checked against the signed-in user.
- **Serializing (`filtersToSearchParams`):** fields at their default are left out. It is documented as the inverse of the parser for every value the parser accepts.
- **Comparison and chips:**
  - `filtersEqual` compares categories in order.
  - `hasActiveFilters` is true when the serialized query string is not empty.
  - Chips are ordered search, scope, categories, rating, then usage status. Each chip's `next` resets only its own field.
  - `nextChipFocusKey` returns the next chip, else the previous one, else `null`.
- **Rating buckets:**
  - Picker values map as 0 to unrated, 1–4 to `{ gte: n }`, and 5 to `{ gte: 4.5 }`. Any other value maps to `null`.
  - `ratingBucketLabel` returns `'Any rating'` by default.
- **Degraded rating filter:** `shouldDegradeRatingFilter` is true only for a missing-index error with a non-unrated rating bucket. In that case the feed retries without the rating constraint and applies the band on the client.
- **Search tokens:** keywords are lowercase, split on whitespace, stripped of the characters `. , ! ? ; : ( ) " '` and backtick (other punctuation such as `-` is kept), longer than 2 characters, and unique in first-seen order. `generateSearchTokens` returns at most 10.

### UI copy and helpers
- **Auth redirect:** `safeRedirectPath` returns the value only when it starts with `/` and, parsed with `new URL` against a placeholder origin, stays on that origin; it returns `pathname + search + hash`. Anything else (missing, empty, absolute, `//host`, `/\host`, control characters that browsers strip) returns `DEFAULT_AUTH_REDIRECT`.
- **Feed URL storage:** `rememberFeedUrl` and `readFeedUrl` accept only `'/jokes'` or URLs that start with `'/jokes?'`. `readFeedUrl` falls back to `FEED_PATH`. Storage errors are swallowed.
- **Feed status:** `describeFeedStatus` never returns `''`. Its priority is loading (`count === null`), then empty, then append, then count.
- **Feed append:** `describeFeedAppend` returns `''` unless the key is the same and the count grew from a non-zero value.
- **Empty feed:** `describeEmptyFeed` checks, in priority order, an error, a search, active filters, then the default case.
- **Motion:** `entranceDelayMs` is capped at `(MAX_STAGGERED_ITEMS - 1) * STAGGER_STEP_MS` = 440 ms. `nextStaggerBatch` returns the previous object unchanged when `firstId` and `count` are both unchanged.
- **Star rating:** `ratingFromKey` wraps the arrow keys and handles Home and End. It returns `null` for other keys or when `maxStars < 1`.
- **Sharing:** `jokeShareUrl` strips trailing slashes from the origin and URI-encodes the ID (`/joke/<id>`). `copyToClipboard` never throws; it returns `false` on failure.
- **Site URL (`resolveSiteUrl`):**
  - Order: `NEXT_PUBLIC_SITE_URL`, then `VERCEL_PROJECT_PRODUCTION_URL`, then `VERCEL_URL`, then `DEV_SITE_URL`.
  - It prepends `https://` when no scheme is present, strips trailing slashes, and skips candidates that are empty or not valid URLs.
- **CSV parsing:** `parseCSVLine` handles `""` escapes and tolerates unterminated quotes. Quoted fields cannot contain newlines.
- **CSV report:**
  - `describeSkippedRows` names at most 10 row numbers, then adds "and N more", and de-duplicates the reasons.
  - `summarizeImport` returns one of four title and description outcomes.

## Side Effects

- **`firebase.ts`:**
  - On import, it reads the `NEXT_PUBLIC_FIREBASE_*` variables and `NODE_ENV`, then eagerly creates the client app, Firestore, and Auth.
  - Outside production, it logs a config check that shows only set or MISSING (no values) and `'Firebase initialized successfully.'`.
- **`admin.ts`:** on first property access, it reads the `FIREBASE_*` credentials, initializes firebase-admin once per process, and caches the instances in module variables.
- **`auth.ts`:**
  - Reads `JOKEHUB_API_TOKEN` once at module load.
  - `verifyRequestAuth` calls `adminAuth.verifyIdToken`. This initializes the Admin SDK and may fetch Google public keys over the network.
  - Logs with `console.error` or `console.warn` on configuration problems and verification failures.
- **`rateLimit.ts`:** keeps a module-level mutable `Map` (`windows`) of counters per process. Nothing is shared across instances. `userRouteGuard.requireUser` changes this state.
- **`userRouteGuard.ts`:** `readJson` consumes `request.json()`. `internalError` logs `console.error('[taste-api]', { scope, method, code, errorName })`.
- **`firestoreErrors.ts`:** `warnMissingIndex` calls `console.warn` and includes the Firebase console index URL when one is present; otherwise it includes the full error message.
- **`siteUrl.ts`:** `SITE_URL` reads `NEXT_PUBLIC_SITE_URL`, `VERCEL_PROJECT_PRODUCTION_URL`, and `VERCEL_URL` once at import, using static `process.env` member access.
- **`feedReturn.ts`:** reads and writes the `jokehub:last-feed-url` key on a storage object the caller passes in.
- **`studioBatches.ts`:**
  - `sessionStorageOrNull` accesses `window.sessionStorage`.
  - Batches are read and written under `jokehub:studio-batches:<uid>`.
  - `studioId` increments a module-level counter and reads `Date.now()` and `Math.random()`.
- **`share.ts`:** `copyToClipboard` calls `writeText` on the clipboard object passed in.
- **`generationProgress.ts`:** `readGenerationStream` consumes the given `ReadableStream`, calls `onFrame` for each frame, and cancels the reader in `finally`.
- **Pure modules:** all other modules have no side effects.

## Verification

- Run: `npm test`
- Focused: `npm test -- src/lib/<file>.test.ts` (for example, `npm test -- src/lib/jokeFilters.test.ts`).
- `admin.ts`, `firebase.ts`, `firestoreErrors.ts`, `types.ts`, `userRouteGuard.ts`, and `utils.ts` have no colocated `*.test.ts` file in this directory.
