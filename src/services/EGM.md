# services

## Overview

Data operations used by the app's client code. Four top-level modules:

- `jokeService.ts`: feed queries and CRUD for the `jokes` collection, using
  the client Firestore SDK (`db` from `@/lib/firebase`).
- `ratingService.ts`: per-user star ratings in `jokeRatings` and the running
  rating aggregates on the joke document (client Firestore SDK).
- `categoryService.ts`: per-user categories in `categories` (client
  Firestore SDK).
- `tasteService.ts`: client wrapper around the generation-feedback and
  joke-samples API routes, using `fetch` with the signed-in user's Firebase ID
  token. It does not touch Firestore directly.

Admin-SDK (server-only) operations live in the `server/` subdirectory.

## Interface

- Subdirectory: [server](./server/EGM.md) - Admin-SDK Firestore operations:
  generation exemplars and avoid examples (`jokeExemplars.ts`), per-user
  feedback, samples and taste profile (`tasteStore.ts`), and top-rated jokes
  (`topJokes.ts`).

### `jokeService.ts`

- `FilterParams`: `{ selectedCategories; filterFunnyRate; usageStatus: 'all' | 'used' | 'unused'; scope: 'public' | 'user'; search; limit? }`.
  `filterFunnyRate` is the community-rating band: -1 any, 0 unrated, 1-5 a
  band of `averageRating`.
- `buildJokesQuery(filters, userId?, lastVisibleJokeDoc?, { orderByDateAdded = true })`:
  exported for tests; returns `null` for `scope: 'user'` without a `userId`.
- `fetchJokes(filters, userId?, lastVisibleJokeDoc?)`: resolves to
  `{ jokes, lastVisible, hasMore, ratingFilterDegraded }`.
- `addJoke({ text, category, source?, funnyRate? }, userId): Promise<string>`:
  returns the new document id.
- `importJokes(jokes, userId): Promise<void>`.
- `toggleJokeUsed(jokeId, userId)`, `updateJoke(jokeId, updatedData, userId)`,
  `deleteJoke(jokeId, userId)`.
- `getJokeById(jokeId): Promise<Joke | null>`.
- `fetchUserFiveStarJokes(userId): Promise<string[]>`: texts of the user's
  last 10 five-star-rated jokes.

### `ratingService.ts`

- `ratingDocId(jokeId, userId)`: `` `${jokeId}_${userId}` ``.
- `RatingAggregates`: `{ averageRating; ratingCount; ratingSum }`.
- `submitUserRating(jokeId, stars, userId, comment?): Promise<RatingAggregates>`.
- `fetchAllRatingsForJoke(jokeId): Promise<UserRating[]>`: newest
  `updatedAt` first.

### `categoryService.ts`

- `ensureCategoryExists(categoryName, userId): Promise<string>`: returns the
  stored (trimmed) category name, creating it when absent.
- `subscribeToUserCategories(userId, onUpdate, onError)`: returns the
  `onSnapshot` unsubscribe function; categories ordered by `name` asc.

### `tasteService.ts`

- `TokenSource`: `{ getIdToken(): Promise<string> }` (a Firebase `User`
  satisfies it).
- `TasteRequestError(message, status, code?)`: thrown on a non-OK response or
  a body that fails schema validation (`code: 'INVALID_RESPONSE'`).
- Feedback route (`FEEDBACK_API_PATH` = `/api/generated-joke-feedback`):
  `listFeedback(auth, limit?)` (GET), `setFeedback(auth, input)` (POST,
  returns `null` when the record was deleted), `clearFeedback(auth)` (DELETE,
  returns the deleted count).
- Samples route (`SAMPLES_API_PATH` = `/api/joke-samples`):
  `listSamples(auth)` (GET), `createSample(auth, input)` (POST; documented to
  throw code `SAMPLE_LIMIT` at the cap), `updateSample(auth, input)` (PATCH;
  documented to throw code `NOT_FOUND`), `deleteSample(auth, id)` (DELETE with
  `?id=`).

## Invariants

- Feed search: `generateSearchTokens(search)` tokenizes the term; only the
  first token is a query constraint (`keywords array-contains`), and the
  remaining tokens are ANDed client-side. A non-blank search with no tokens
  returns an empty page without a query. When a page filters to empty and
  `hasMore` is true, `fetchJokes` pages on up to `MAX_SEARCH_PAGES` (5) extra
  pages.
- Category filter uses `category in` with at most the first 30 selected
  categories.
- Rating filter reads `averageRating`/`ratingCount` (community rating), not
  `funnyRate`. Unrated band = `ratingCount == 0`; other bands =
  `averageRating >= bucket.gte` with `orderBy('averageRating', 'desc')` placed
  before `orderBy('dateAdded', 'desc')`.
- Missing-index handling (`isMissingIndexError`) in `fetchJokes`: for rating
  bands 1-5 (`shouldDegradeRatingFilter`; the unrated band 0 never degrades),
  the fallback first retries without the rating band, keeping the `dateAdded`
  ordering, and applies the band client-side (`ratingFilterDegraded: true`,
  sticky across pages pulled by one call). If that retry also misses an index,
  or for every other filter combination, it drops the ordering and sorts by
  `dateAdded` client-side. Both can apply to one call. The cursor
  (`lastVisible`) and `hasMore` always come from the raw query docs.
  `fetchUserFiveStarJokes` and `fetchAllRatingsForJoke` drop `orderBy` and
  sort client-side on the same error.
- Page size defaults to `PAGE_SIZE` (12); `hasMore` is `docs.length === limit`.
- Firestore batches are chunked at `MAX_BATCH_WRITES` (500) in `importJokes`
  and `deleteJoke`. A failed `importJokes` chunk after earlier commits throws
  `Imported N of M jokes before the import failed: ...`; jokes with a blank
  category are skipped with a warning.
- `toggleJokeUsed`, `updateJoke` and `deleteJoke` throw unless the stored
  `userId` equals the caller's `userId`; a missing joke throws
  `Joke not found.` (`getJokeById` returns `null` instead).
- `updateJoke`: `text` in the patch always regenerates `keywords`, even when
  unchanged; `explanation` is set to `''` only when the new text differs from
  the stored text, unless an explicit `explanation` is passed; an empty patch
  makes no write. A non-empty `category` in the patch goes through
  `ensureCategoryExists`.
- `deleteJoke` deletes every `jokeRatings` doc for the joke, then the joke
  itself last.
- New jokes (`addJoke`, `importJokes`) get `dateAdded: Timestamp.now()`,
  `used: false`, `userId`, `keywords: generateKeywords(text)`, `source`
  default `''`, `funnyRate` default 0.
- Ratings: one document per user per joke (`ratingDocId`). `stars` must be
  1-5 and `comment` at most 1000 characters, else `submitUserRating` throws.
  It also throws `Joke ${jokeId} not found.` when the joke document is
  missing, and stores `comment` trimmed, or `null` when blank or absent.
- `fetchAllRatingsForJoke` wraps any non-index failure, and any failure of the
  fallback query, as `Error('Failed to fetch ratings for joke ${jokeId}.')`.
  The transaction reads the joke and rating docs before any write, updates
  `ratingSum`, `ratingCount` and `averageRating` (rounded to one decimal), and
  preserves the rating's `createdAt` on update. Legacy jokes without
  `ratingSum` derive it as `round(averageRating * ratingCount)`.
- `ensureCategoryExists` throws on a blank name and looks the category up with
  an exact, case-sensitive `name ==` match on the trimmed name.
- `subscribeToUserCategories` drops documents without a non-blank string
  `name` and emits each name trimmed. Its error callback receives a generic
  `new Error('Could not load user categories.')`, not the Firestore error.
- `tasteService.ts` sends `Authorization: Bearer <ID token>` on every request
  and validates every response body with a zod schema.

## Side Effects

- Client Firestore reads: `jokes`, `jokeRatings`, `categories`;
  `subscribeToUserCategories` opens a realtime `onSnapshot` listener.
- Client Firestore writes: `jokes` (`addDoc`, batched `set`, `updateDoc`,
  batched `delete`), `jokeRatings` (transactional `set` with merge, batched
  `delete` in `deleteJoke`), `categories` (`addDoc`).
- HTTP requests from `tasteService.ts` to `/api/generated-joke-feedback` and
  `/api/joke-samples`.
- Console output: `warnMissingIndex` on missing indexes, `console.warn` for
  skipped imports, `console.error` in `fetchAllRatingsForJoke` and the
  category subscription error path.

## Verification

- Run: `npm test -- src/services`
- Full suite: `npm test`
- Test files present: `jokeService.test.ts`, `ratingService.test.ts`,
  `tasteService.test.ts`. No test file exists for `categoryService.ts`.
