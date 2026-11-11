# services/server

## Overview

Server-side Firestore data operations that use the Firebase Admin SDK
(`adminDb` from `@/lib/admin`), which bypasses Firestore security rules. The
directory holds three modules:

- `jokeExemplars.ts`: read-only, cached selection of joke texts from the
  `jokes` and `generatedJokeFeedback` collections, used as generation context
  (good exemplars, examples to avoid, and the library texts to check generated
  jokes against).
- `tasteStore.ts`: per-user generation feedback (`generatedJokeFeedback`) and
  joke samples (`users/{uid}/jokeSamples`), plus the derived `TasteProfile`.
- `topJokes.ts`: top-rated jokes query (`fetchTopJokes`).

Schemas, limits and types come from `@/lib/tasteProfile` and
`@/lib/jokeGenerationContract`; see those files for the field-level contracts.

## Interface

### `jokeExemplars.ts`

- `GENERATED_JOKE_FEEDBACK_COLLECTION = 'generatedJokeFeedback'`: collection
  name, also imported by `tasteStore.ts`.
- `fetchJokeExemplars(limitCount = JOKE_GENERATION_LIMITS.exemplarJokes): Promise<string[]>`:
  joke texts whose `averageRating` is 4-5 and `ratingCount >= 1`, round-robin
  across normalized categories. Throws `RangeError` when `limitCount` is not an
  integer from 1 to `JOKE_GENERATION_LIMITS.exemplarJokes`.
- `fetchAvoidExamples(userId?: string): Promise<string[]>`: up to 4 recent
  thumbs-down generated jokes of `userId` (`userId == userId`,
  `vote == 'down'`), then jokes rated 1-2 stars (lowest first), at most 6
  texts in total, merged through `mergeUniqueJokeTexts`. Without `userId`, no
  downvotes are read.
- `fetchLibraryJokeTexts(): Promise<string[]>`: saved joke texts, newest
  `dateAdded` first, up to `JOKE_GENERATION_LIMITS.libraryJokes`.

### `tasteStore.ts`

- `SampleLimitError`: `Error` subclass with `code = 'SAMPLE_LIMIT'`.
- `tasteDocId(text): string`: first 32 hex chars of
  `sha256(normalizeJokeKey(text))`.
- `upsertFeedback(uid, input: FeedbackUpsertInput): Promise<GenerationFeedback | null>`:
  transactional merge of one feedback record; returns `null` when the record
  was deleted.
- `countFeedback(feedback): FeedbackCounts`: `{ liked, disliked }`.
- `listFeedback(uid, limit = TASTE_LIMITS.feedbackPage): Promise<GenerationFeedback[]>`.
- `summarizeFeedback(uid, limit = TASTE_LIMITS.feedbackPage): Promise<{ feedback; counts }>`.
- `clearFeedback(uid): Promise<number>`: number of documents deleted.
- `listSamples(uid): Promise<JokeSample[]>`: `orderBy('createdAt', 'desc').limit(TASTE_LIMITS.maxSamples)`;
  malformed documents are skipped.
- `createSample(uid, input: SampleCreate): Promise<{ sample; created }>`.
- `updateSample(uid, input: SampleUpdate): Promise<JokeSample | null>`.
- `deleteSample(uid, id): Promise<boolean>`.
- `upsertFeedback`, `createSample` and `updateSample` validate their input with
  zod `.parse` (`FeedbackUpsertSchema`, `SampleCreateSchema`,
  `SampleUpdateSchema`) and throw `ZodError` on invalid input.
- `loadTasteProfile(uid): Promise<TasteProfile>`.

### `topJokes.ts`

- `FetchTopJokesOptions`: `{ limit?: number; minRating?: number }`.
- `fetchTopJokes(options = {}): Promise<Joke[]>`: `jokes` where
  `averageRating >= minRating` (default 4), ordered by `averageRating` desc,
  limit default 10; `dateAdded` converted with the Admin `Timestamp` class
  (non-Timestamp values become `new Date(0)`).

## Invariants

- All modules use the Admin SDK only; none imports the client Firestore SDK.
  `tasteStore.ts` notes that its paths have no client rules
  (`firestore.rules` has no match for `generatedJokeFeedback` or
  `jokeSamples`).
- Feedback document id is `${uid}_${tasteDocId(jokeText)}`; sample document id
  is `tasteDocId(text)`. `checkedUid` rejects empty uids and uids containing
  `/` with `Error('Invalid user id')`.
- `upsertFeedback` merge rules: for `vote`/`reason`, `undefined` = unchanged,
  `null` (or legacy `'none'`) = clear. For `saved`, `category`, `topicHint`,
  `model`, `requestId`, `undefined` = unchanged. A blank or whitespace-only
  `reason`, `category`, `topicHint`, `model` or `requestId` is trimmed to
  `undefined` (`optionalText`) and dropped from the stored document, so it
  clears the field. `mode` is `change.mode`, or
  the existing `mode` when not given. A reason is kept only alongside a vote; a
  changed vote without a new reason drops the old reason. A cleared vote is
  stored as `null`, never `'none'`. When the result has no vote and is not
  saved, the document is deleted and `null` is returned. `createdAt` is
  preserved from the existing document (falling back to its `updatedAt`) only
  when that document parses as valid feedback; a malformed existing document
  gets `createdAt = now`.
- Legacy feedback documents without `saved`, or with `vote: 'none'`, read as
  not saved and no vote. Records with no vote and not saved are excluded from
  listings. Malformed feedback and sample documents are skipped, not thrown.
- Liked = `vote === 'up'`, or `saved` without a `'down'` vote; disliked =
  `vote === 'down'`. `countFeedback` and `loadTasteProfile` use the same rule.
- `listFeedback`/`summarizeFeedback` throw `RangeError` unless `limit` is an
  integer from 1 to `TASTE_LIMITS.feedbackPage` (100). Both read at most 500
  documents per user (`FEEDBACK_READ_CAP`), sort newest `updatedAt` first, and
  `summarizeFeedback` counts over every record read, not only the returned page.
- Feedback listing first queries `userId ==` with `orderBy('updatedAt', 'desc')`
  (the `generatedJokeFeedback` composite index in `firestore.indexes.json`); on
  a missing-index error (`isMissingIndexError`) it warns and falls back to an
  unordered equality-only read. Documents whose id does not start with
  `${uid}_` are skipped.
- Samples are capped at `TASTE_LIMITS.maxSamples` (50). `createSample` is
  idempotent by normalized text: an existing sample returns `created: false`,
  is re-activated, and has its note replaced only when a non-blank note is
  given. A new sample beyond the cap throws `SampleLimitError`.
- `updateSample`: `active`/`note` `undefined` = unchanged; `null` or blank
  clears the note; returns `null` when the sample is missing or the existing
  document fails `JokeSampleSchema`. `deleteSample`
  returns `false` for an id failing `TasteDocIdSchema` or a missing document.
- `loadTasteProfile` never throws: an empty or non-string uid, or any storage
  error, yields `emptyTasteProfile()`. It keeps active samples with valid
  `JokeTextSchema` text, capped by `JOKE_GENERATION_LIMITS.tasteSamples`, and
  liked/disliked examples from the newest feedback page, capped by
  `tasteLiked`/`tasteDisliked`; reasons are truncated to
  `JOKE_GENERATION_LIMITS.tasteReasonChars`. Logged error codes pass through
  `safeErrorCode` (finite numbers or `^[A-Za-z0-9_/-]{1,40}$` strings only).
- Undefined values are stripped (`compact`) before any Firestore write.
- `jokeExemplars.ts` reads are bounded (`POOL_SIZE` 200, `AVOID_POOL_SIZE`
  100, `DOWNVOTE_POOL_SIZE` 50) and results are cached in module memory for 60
  seconds (`TTL_MS`), avoid examples per `userId`; callers receive copies of
  cached arrays. Exemplar pools
  are never padded with unrated jokes. Exemplar ordering prefers website
  sources (`isWebsiteSource`), then higher average, then a random draw, then
  document id.
- `fetchJokeExemplars` runs a second query (`jokes`
  `orderBy('dateAdded', 'desc').limit(200)`) whenever the primary pool has
  fewer than `JOKE_GENERATION_LIMITS.exemplarJokes` items or fewer than 2
  distinct non-empty categories, not only when the primary query fails.
- Exemplar, library and low-rated avoid readers take the text from `text`,
  falling back to `jokeText`; the downvote reader reads only `jokeText`. Either
  must pass `validText` (at most `contextTextChars`
  characters and a non-empty normalized key).
- The downvote reader is scoped to one user: it reads
  `generatedJokeFeedback where userId == userId where vote == 'down' limit 50`
  and sorts by `updatedAt` in memory.
- Read failures in `jokeExemplars.ts` are swallowed: the exemplar fallback
  query keeps any already qualified pool, avoid examples degrade to empty
  parts, and `fetchLibraryJokeTexts` returns `[]`. A result computed after any
  failed read is returned but not cached, so the next call reads again.

## Side Effects

- Firestore reads via the Admin SDK: `jokes`, `generatedJokeFeedback`,
  `users/{uid}/jokeSamples`.
- Firestore writes via the Admin SDK: `upsertFeedback` (transactional
  `set`/`delete` on `generatedJokeFeedback`), `clearFeedback` (batched deletes,
  400 per batch), `createSample`/`updateSample` (transactional `set`),
  `deleteSample` (`delete`). Sample documents store `text`, `note`, `active`,
  `createdAt`, `updatedAt`; `active` reads as `true` when absent. Feedback
  documents store `userId`, `jokeText`,
  `category`, `vote`, `reason`, `saved`, `topicHint`, `model`, `mode`,
  `requestId`, `createdAt`, `updatedAt`.
- Module-level in-memory caches in `jokeExemplars.ts` (`cache`, `avoidCache`,
  `libraryCache`). Expired `avoidCache` entries are removed when a new entry is
  stored.
- `console.warn` on a missing feedback index (`[taste-store]`) and on a failed
  taste-profile load (`[taste-profile]`).

## Verification

- Run: `npm test -- src/services/server`
- Full suite: `npm test`
- Test files present: `jokeExemplars.test.ts`, `tasteStore.test.ts`. No test
  file exists for `topJokes.ts`.
