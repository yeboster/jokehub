# joke/[jokeId]

## Overview
The `/joke/[jokeId]` route: the detail page for a single joke. It shows the joke, an AI explanation the user can request, the user's own rating form, and community ratings. Sources: `page.tsx` (client component) and `layout.tsx` (sets the metadata title `'Joke'`).

## Interface
- `default JokeShowPage` in `page.tsx`. It reads `jokeId` from `useParams()`.
- `default JokeLayout` in `layout.tsx`. It sets `metadata.title = 'Joke'` and renders its children unchanged.
- Context functions used, from `useJokes()`: `getJokeById`, `fetchAllRatingsForJoke`, `submitUserRating`, `toggleUsed`.
- Child components: `JokeHeader`, `ExplanationCard`, `RatingForm`, `CommunityRatings`, `BackToFeedButton`, `CopyLinkButton`, `EmptyState`.
- `streamExplanation(jokeId)` is a `useCallback` declared inside `JokeShowPage`, not at module scope. It sends `POST /api/explain-joke` with `{ jokeId }` and `Authorization: Bearer <idToken>`, then reads the response body as a text stream.

## Invariants
- An explanation is requested only from an explicit user click (`ExplanationCard` `onExplain`), never on page view. Signed-out users get a "Sign in required" toast instead.
- A previously displayed explanation is replaced only when the first new chunk arrives, so a failed request leaves the old text in place.
- A `200` response with an empty body shows a toast.
- A non-OK response or a missing body shows a destructive "Couldn't explain that one" toast. Its text is the JSON `error` field, or `Failed to get explanation: <statusText>`. The previous explanation stays.
- A saved explanation (`fetchedJoke.explanation`) is shown automatically when the joke loads.
- Data loads only after auth has resolved. A missing `jokeId` shows the error state "Joke ID is missing.".
- When `getJokeById` returns `null`, the error card shows "Joke not found. It might have been deleted or the ID is incorrect.". A failed fetch also returns `null` (the context catches it and shows its own toast), so it shows the same card. The `EmptyState` not-found branch and the "Failed to load the joke or ratings…" catch are not reached through these context calls.
- `toggleUsed` is available only to the joke's owner (`joke.userId === user.uid`).
- After a rating is submitted, local state is patched instead of re-read:
  - The aggregates returned by the transaction are merged into `joke`.
  - The submitted rating goes first in `allUserRatings`, replacing the user's previous entry.
  - A blank comment is stored as `null`.
  - The rating id falls back to `ratingDocId(joke.id, user.uid)`.
- The page shows exactly one toast per rating submit.
- The load-result live region (`role="status"`) mounts empty and is filled from an effect through `describeJokeLoadResult`.
- `isSourceUrl` is true only for `http:` and `https:` URLs.

## Side Effects
- Firestore reads and writes through the `useJokes()` context functions, which are outside this subtree.
- Network call to `/api/explain-joke`, which costs one paid AI call per request.
- Toasts through `useToast`.

## Verification
- No colocated test file in this directory. Run the full suite: `npm test`
