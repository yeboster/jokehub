# contexts

## Overview

Client-side React context providers (`"use client"`) for authentication and joke state. `AuthContext.tsx` wraps the Firebase Auth session; `JokeContext.tsx` holds the paginated joke list, the signed-in user's categories, and the mutation helpers that delegate to `@/services/jokeService`, `@/services/categoryService`, and `@/services/ratingService`. Both providers are mounted in `src/app/layout.tsx` as `<AuthProvider><JokeProvider>...</JokeProvider></AuthProvider>`.

## Interface

### `AuthContext.tsx`

- `AuthProvider: React.FC<{ children }>`: provides the auth context value.
- `useAuth(): AuthContextProps`: returns the context. Throws `Error('useAuth must be used within an AuthProvider')` when called outside the provider.
- `AuthContextProps` (not exported):
  - `user: User | null` (Firebase `User`)
  - `loading: boolean` (initially `true`)
  - `signIn(email, pass): Promise<User | null>`
  - `signUp(email, pass): Promise<User | null>`
  - `signOutUser(): Promise<void>`

### `JokeContext.tsx`

- `JokeProvider: React.FC<{ children }>`: provides the joke context value.
- `useJokes(): JokeContextProps`: returns the context. Throws `Error('useJokes must be used within a JokeProvider')` when called outside the provider.
- `type FilterParams = jokeService.FilterParams` (re-exported).
- `JokeContextProps` (not exported), state fields:
  - `jokes: Joke[] | null`
  - `loadedFilters: FilterParams | null`
  - `jokesError: string | null`
  - `categories: Category[] | null`
  - `hasMoreJokes`, `loadingInitialJokes`, `loadingMoreJokes`, `loadingCategories: boolean`
- `JokeContextProps` operations:
  - `loadJokesWithFilters(filters)`, `loadMoreFilteredJokes()`
  - `addJoke(data) => Promise<string | undefined>`, `importJokes(data[])`
  - `toggleUsed(id, currentUsedStatus)`, `updateJoke(jokeId, updatedData)`, `deleteJoke(jokeId)`
  - `getJokeById(jokeId) => Promise<Joke | null>`
  - `submitUserRating(jokeId, stars, comment?) => Promise<ratingService.RatingAggregates | undefined>`
  - `fetchAllRatingsForJoke(jokeId) => Promise<UserRating[]>`

## Invariants

- `JokeProvider` calls `useAuth()`, so it must be rendered inside `AuthProvider` (`JokeContext.tsx:JokeProvider`).
- Auth `loading` stays `true` until the first `onAuthStateChanged` callback. `signIn`, `signUp`, and `signOutUser` set it to `true` and reset it to `false` in `finally` (`AuthContext.tsx:AuthProvider`).
- `signIn` and `signUp` re-throw Firebase errors to the caller. `signOutUser` does not re-throw; on success it shows the toast "Signed out" / "You are signed out of Joke Hub.", and on failure a destructive toast (`AuthContext.tsx:signIn/signUp/signOutUser`).
- `categories` state machine (`JokeContext.tsx` categories effect):
  - `null` with `loadingCategories=true` while auth is loading, and again when a new user's subscription starts. The previous user's list is dropped.
  - `[]` with `loadingCategories=false` when signed out or when the subscription errors. A subscription error also shows the destructive toast "Couldn't load your categories" with `error.message`.
- Initial state: `loadingInitialJokes = true` and `hasMoreJokes = true`. The provider does not fetch jokes on its own, so `loadingInitialJokes` stays `true` until a page calls `loadJokesWithFilters`.
- Joke fetches are guarded by the monotonic `jokeRequestIdRef`. A response is applied only if its request is still the newest (`isStale`) (`JokeContext.tsx:fetchJokesInternal`).
- Loading flags are cleared only by the newest request of the same kind (`initial` or `more`), tracked in `newestRequestByKindRef` (`ownsLoadingFlag`).
- An initial fetch keeps the current `jokes` in place; it does not reset them to `null`. It clears `jokesError` and resets the pagination cursor `lastVisibleJokeDocRef`. `jokes === null` means only "no list yet" (`fetchJokesInternal`).
- `loadedFilters` is set from the result of the newest successful initial fetch, a failed initial fetch, or the signed-out `scope === 'user'` short-circuit. It is never set at request time (`fetchJokesInternal`).
- Any failed joke fetch shows the destructive toast "Couldn't load jokes" (with `err.message`) and sets `hasMoreJokes=false`. Only a failed initial fetch also sets `jokes` to `[]` and sets `jokesError` (`fetchJokesInternal`).
- `filters.scope === 'user'` with no signed-in user returns an empty list without calling `jokeService` and sets `hasMoreJokes=false`. On an initial fetch it also sets `jokesError=null` (`fetchJokesInternal`).
- `loadMoreFilteredJokes` does nothing when `!hasMoreJokes || loadingMoreJokes`, and it reuses the filters from the last `loadJokesWithFilters` call (`activeFiltersRef`).
- The provider has no auto-fetch effect. Pages call `loadJokesWithFilters` themselves (comment in `JokeContext.tsx`).
- The "Rating filter limited" toast appears at most once per provider lifetime (`ratingDegradeNoticeShownRef`).
- Signed-out callers:
  - `addJoke`, `importJokes`, `toggleUsed`, `updateJoke`, `deleteJoke`, and `submitUserRating` throw `Error("User not authenticated ...")` before calling `handleApiCall`. `addJoke` and `importJokes` are non-async and throw synchronously; the others are `async`, so the error surfaces as a rejected promise.
  - `handleApiCall` also checks for a user. When there is none, it shows a "Sign in required" toast and returns `undefined`.
- `handleApiCall` shows exactly one success toast when `success` is non-null. `addJoke`, `importJokes`, and `submitUserRating` pass `null`, so their callers announce success.
- `handleApiCall` re-throws errors. It shows no error toast when the message contains `Category name cannot be empty` or `permission denied`.
- `getJokeById` and `fetchAllRatingsForJoke` never throw. On error they show a toast and return `null` or `[]`.
- Successful mutations patch local `jokes` in place instead of refetching:
  - `toggleUsed` flips `used`.
  - `updateJoke` merges `updatedData`.
  - `deleteJoke` removes the joke.
  - `submitUserRating` merges the returned aggregates.

## Side Effects

- Firebase Auth via `@/lib/firebase` `auth`:
  - Subscribes with `onAuthStateChanged` and unsubscribes on unmount.
  - Calls `signInWithEmailAndPassword`, `createUserWithEmailAndPassword`, and `signOut` (`AuthContext.tsx`).
- Calls into the Firebase-facing services in `src/services/` (`JokeContext.tsx`). This contract does not cover what those services do internally:
  - `categoryService.subscribeToUserCategories(user.uid, onNext, onError)` returns an unsubscribe function, which the effect cleanup calls.
  - Fetches: `jokeService.fetchJokes(filters, user?.uid, cursor)`, `jokeService.getJokeById`, `ratingService.fetchAllRatingsForJoke`.
  - Mutations, routed through `handleApiCall` with `user.uid`: `jokeService.addJoke`, `jokeService.importJokes`, `jokeService.toggleJokeUsed`, `jokeService.updateJoke`, `jokeService.deleteJoke`, `ratingService.submitUserRating`.
- UI toasts via `useToast()` from `@/hooks/use-toast`, plus `console.error` logging on failures (both files).

## Verification

- No test files exist in this directory.
- Test files that reference these modules: `src/app/add-joke/page.test.tsx`, `src/app/edit-joke/[jokeId]/page.test.tsx`, `src/components/add-joke-form.test.tsx`, `src/components/csv-import.test.tsx`, and `src/components/jokes/JokeFilterDialog.test.tsx`.
- Run: `npm test`
- Focused: `npm test -- src/components/add-joke-form.test.tsx`
