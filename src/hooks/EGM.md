# hooks

## Overview

Reusable client-side React hooks for Jokehub. They cover URL-derived joke feed
filters, the signed-in user's category names, the global toast store, a mobile
breakpoint check, and the Joke Studio state: generation requests, generation
feedback, sample jokes, session batches, and the remembered model choice.
Every file except `use-mobile.tsx` starts with `"use client"`. There are no
test files in this directory. The hooks are exercised by component and page
tests elsewhere (for example
`src/components/jokes/JokeFilterDialog.test.tsx`,
`src/components/joke-studio/SamplesPanel.test.tsx`,
`src/components/joke-studio/TastePanel.test.tsx`, and
`src/app/add-joke/page.test.tsx`).

## Interface

- `use-mobile.tsx`: `useIsMobile(): boolean`. True when `window.innerWidth < 768` (`MOBILE_BREAKPOINT`, not exported).
- `use-toast.ts`: `useToast()` returns `{ toasts, toast, dismiss(toastId?) }`. Also exports a standalone `toast(props)` that returns `{ id, dismiss, update }`, and the pure `reducer(state, action)` for the `ADD_TOAST`, `UPDATE_TOAST`, `DISMISS_TOAST`, and `REMOVE_TOAST` actions.
- `useJokeFilters.ts`: `useJokeFilters(): UseJokeFiltersResult` returns `{ filters: FilterParams, applyFilters(next), clearFilters() }`. Also exports the `UseJokeFiltersResult` interface.
- `useUserCategories.ts`: `useUserCategories(): UseUserCategoriesResult` returns `{ categoryNames: string[], loadingCategories: boolean }`. Also exports the `UseUserCategoriesResult` interface.
- `useRememberedModel.ts`: `useRememberedModel(): [GeminiModel, (value: string) => void]` and the constant `STUDIO_MODEL_KEY = 'jokehub:studio-model'`.
- `useStudioBatches.ts`: `useStudioBatches(uid)` returns `{ batches, addBatch, updateJoke, updateJokes, findJoke }`.
- `useJokeGeneration.ts`: `useJokeGeneration(user, onGenerated)` returns `{ generate, isGenerating, progressStage, progressModel, requestId, error, elapsedSeconds }`. Also exports the `GenerationRequest` type.
- `useGenerationFeedback.ts`: `useGenerationFeedback(user: TokenSource)` returns `{ feedback, counts, status, resetting, removing, load, record, remove, reset }`. Also exports the `LoadStatus` (`'loading' | 'ready' | 'error'`) and `GenerationFeedbackApi` types.
- `useJokeSamples.ts`: `useJokeSamples(user: TokenSource & { uid })` returns `{ samples, status, pending, importing, load, add, setActive, remove, importFiveStar, hasSample, isAdding }`. Also exports the `AddSampleOutcome` (`'created' | 'existing' | 'limit' | 'error'`), `ImportReport`, and `JokeSamplesApi` types.

## Invariants

- `useJokeFilters`: the URL query string is the single source of truth. `filters` comes from `parseFiltersFromParams` in a `useMemo` keyed on `searchParams.toString()` and signed-in state. It is never copied into state by an effect.
- `useJokeFilters`: when a signed-out user opens a link with `scope === 'user'`, `filters` falls back to `scope: 'public'` and the URL is left unchanged.
- `useJokeFilters`: `applyFilters` serializes with `filtersToSearchParams` and pushes `/jokes?<query>`, or `/jokes` when the query is empty. Consumers must not rely on the identity of the `filters` object; the source comment points to `filtersEqual`.
- `useUserCategories`: `categoryNames` contains only categories where `category.userId === user.uid`. Names are trimmed, empty names are dropped, duplicates are removed case-insensitively (the first casing is kept), and the list is sorted case-insensitively. The list is empty when there is no user or no categories.
- `use-toast`: `TOAST_LIMIT = 1`, so a new toast replaces the current one. The comment block in `use-toast.ts` defines the copy and variant conventions: `JokeContext.handleApiCall` announces errors once, and destructive titles start with "Couldn't ".
- `useRememberedModel`: only values that pass `isGeminiModel` are stored or returned. An invalid or unreadable stored value falls back to `DEFAULT_GENERATE_MODEL`. `choose` ignores values that are not in the catalog.
- `useJokeGeneration`: only one request can run at a time. The `generation` ref blocks a second call made in the same render. Results that arrive after unmount, or for a request that is no longer current, are ignored.
- `useJokeGeneration`: the response must pass `GenerationResultSchema.safeParse`; otherwise the hook raises an error.
- `useGenerationFeedback`: a `loadSequence` counter discards list responses that are out of date. `applyRecord` replaces the record matched by id or by `normalizeJokeKey(jokeText)` and keeps `liked`/`disliked` counts at 0 or above. In `isLiked`, a joke counts as liked when `vote === 'up'`, or when it is saved and the vote is not `'down'`.
- `useGenerationFeedback`: `record` throws when the request fails, so the caller can roll back.
- `useJokeSamples`: `add` refuses a new sample when `TASTE_LIMITS.maxSamples` is reached. It also handles server limit errors (`code === 'SAMPLE_LIMIT'`, `status === 409`, or a message containing `SAMPLE_LIMIT`). A ref-based set of keys prevents adding the same normalized text twice at once.
- `useJokeSamples`: `setActive` updates the list before the server answers and rolls back on failure. `importFiveStar` will not start while an import is running. It keeps only texts that pass `isUsableText` (at most `JOKE_GENERATION_LIMITS.contextTextChars` characters, with a non-empty normalized key) and stops at the sample cap.
- `useStudioBatches`, `useJokeGeneration`, `useGenerationFeedback`, `useJokeSamples`: their doc comments say to mount them under a parent keyed by uid. `useStudioBatches` reads storage only once, when it first mounts.
- All async Studio hooks check a `mounted` ref and skip state updates and toasts after unmount.

## Side Effects

- `useJokeFilters`: calls Next.js `router.push` to change the browser URL.
- `use-toast`: keeps state in module-level variables shared by all hook instances (`memoryState`, `listeners`, `toastTimeouts`, `count`). Dismissing a toast schedules its removal with `setTimeout` (`TOAST_REMOVE_DELAY = 1000000` ms).
- `use-mobile`: subscribes to `window.matchMedia('(max-width: 767px)')` change events and reads `window.innerWidth`.
- `useRememberedModel`: reads and writes `window.localStorage` under the `jokehub:studio-model` key. Storage errors are ignored.
- `useStudioBatches`: reads and writes batches in `sessionStorage` through `readStoredBatches` and `writeStoredBatches` from `src/lib/studioBatches.ts`. It writes on every `batches` or `uid` change.
- `useJokeGeneration`: sends `POST /api/generate-joke` with a Firebase ID token (`Authorization: Bearer`) and accepts `application/x-ndjson` streaming responses. Reads the `x-request-id` header, runs a one-second elapsed-time interval while generating, aborts the request with `AbortController` on unmount, and shows toasts.
- `useGenerationFeedback`: makes authenticated HTTP calls through `src/services/tasteService.ts` (`listFeedback`, `setFeedback`, `clearFeedback`). Shows toasts and logs errors with `console.error`.
- `useJokeSamples`: makes authenticated HTTP calls through `src/services/tasteService.ts` (`listSamples`, `createSample`, `updateSample`, `deleteSample`). Its Firestore reads go through `jokeService.fetchUserFiveStarJokes(uid)` in `src/services/jokeService.ts`. Shows toasts and logs errors with `console.error`.
- `useJokeFilters`, `useUserCategories`: read `AuthContext` (`useAuth`). `useUserCategories` also reads `JokeContext` (`useJokes`).

## Verification

- Run: `npm test`
- Focused: `npm test -- src/components/jokes/JokeFilterDialog.test.tsx` (or another test file that uses these hooks)
