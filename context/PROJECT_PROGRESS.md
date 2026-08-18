# Project Progress: Joke Hub

## DONE
*   **Core Setup**: Next.js, ShadCN, Tailwind, Firebase, Genkit initialized.
*   **Authentication**: User signup, login, logout, auth context.
*   **Joke Management**:
    *   Manual Joke Addition (with form, AI assist option).
    *   CSV Joke Import.
    *   Joke Listing with Filters (scope, category, rating, used status) & Pagination.
    *   Individual Joke Viewing Page (layout per mockup, public access).
    *   Joke Editing (text, category, owner rating, 'used' status).
*   **AI Integration**:
    *   AI-powered joke generation for "Add Joke" page.
*   **Rating System**:
    *   Users can submit/update 1-5 star ratings and comments for jokes.
    *   Joke detail page displays "Your Rating" section.
    *   Joke detail page displays "Community Feedback" section (other users' ratings, average rating).
    *   Display of average rating (read-only, or "No ratings yet") on joke list items.
    *   Firestore migration for initial ratings data.
*   **UI/UX**:
    *   Theming with specified colors.
    *   Responsive Navbar.
    *   Toast notifications.
    *   Home page displays latest 3 public jokes with `JokeListItem`.
    *   Joke Detail Page layout updated as per mockup.
    *   `JokeListItem` layout updated to show average rating or "No ratings yet".
*   **Context Management**: `JokeContext` and `AuthContext` are functional.
*   **Error Fixes**: Various bug fixes (e.g., icon imports, public joke viewing).

## WORKING
*   Implementing a context persistence mechanism for the AI assistant (creating summary files).

## DONE (2026-08-15, improvement round 2)
*   Security: hardcoded Firebase UID removed from `/api/jokes/add` → `JOKEHUB_JARVIS_USER_ID` env var (must be set in Vercel env + local `.env.production.local`).
*   Perf: delta-based rating aggregation (`ratingSum`/`ratingCount` on joke doc, 2 reads per submit, was N+1); average rating single-sourced from joke doc; exemplar fetch cached 60s; home page fetches `limit: 3`.
*   Hygiene: dead `my-jokes` route + 12 orphaned components deleted; Vitest setup with 21 unit tests (`npm test`).
*   Infra: `firestore.rules` + `firestore.indexes.json` + `firebase.json` at root; `npm run firestore:deploy` (rules NOT yet deployed); composite-index queries fall back to client-side sort when the index is missing.

## DONE (2026-08-17, improvement round 3)
Driven by the Opus 5 audit `docs/audit-2026-08-17.md` via `docs/plans/2026-08-17-improvement-round-3.md` (9 tasks, one commit each).

*   **Security (§1.3, §1.4)**: both AI routes now require auth (Firebase ID token or `JOKEHUB_API_TOKEN`) and are rate-limited; explanations generate on explicit click instead of on page view; constant-time token compare and strict `Bearer` parsing; auth-infra failures return 500, bad credentials 401.
*   **Firestore (§1.1, §1.2, §1.5–§1.8, §1.11)**: ratings-delete rule gained a joke-owner branch; composite indexes declared; rating-aggregate writes bounded in the rules; deletes/imports chunked at ≤500 writes; timestamp mapping made total (`toDate`/`toMillis`); source length validated client-side.
*   **API hardening (§1.9, §1.10)**: `/api/jokes/top` clamps its query params (`limit` 1–50, `minRating` 0–5, NaN-safe) so a hand-edited URL can't reach Firestore's `limit()` as NaN; `JokeContext.handleApiCall` lost its redundant guard and now reports a safe message for non-`Error` throws.
*   **Dead code (§1.12, commit f862225)**: removed `rateJoke` and `updateJokeCategory` (`jokeService`), `getUserRatingForJoke` (`ratingService`), their `JokeContext` entries, and `src/lib/constants.ts` (`SYSTEM_USER_ID`) — ~90 unreachable lines, zero callers each.
*   **Architecture (§2.1–§2.7)**: joke fetching moved to the pages with request sequencing; `fetchTopJokes` reimplemented against the Admin SDK; `/jokes` split into `src/lib/jokeFilters.ts` + `useJokeFilters` + `<JokeFilterDialog>`; shared `<CategoryCombobox>`; search tokenized to match stored keywords, with an honest empty state; stale-paint guard on client-side nav.
*   **Design/UX (§3.1–§3.7)**: Geist fonts actually wired up, fractional star fills, token-driven alerts, palette docs corrected, skeleton loading states, hardcoded fallback jokes removed, a11y fixes.
*   **Tests (§2.8, Task 9)**: Vitest widened to `src/**/*.test.{ts,tsx}` with `environment: 'jsdom'` (`jsdom` devDependency added; the `next/server` suites opt back into node with a `@vitest-environment` docblock). `parseCSVLine` extracted from `csv-import.tsx` into `src/lib/csv.ts` (behaviour unchanged; the "quoted field containing a newline" limitation is documented there and pinned by a test). New suites: `csv`, `jokeFilters`, `jokeService.buildJokesQuery`, `firestoreTimestamps`, `rateLimit`, and `verifyRequestAuth`. **26 → 146 tests**, all passing alongside lint and typecheck.
*   **Hygiene**: deleted `src/firebase-rules.txt` — a stale duplicate of the root `firestore.rules` predating round-1/3 rule work (no bounded rating-aggregate function, old ratings-delete rule) and referenced by nothing.

## NEXT
*   **Deploy Firestore rules/indexes** — `npm run firestore:deploy`. Still not done: the firebase CLI in this environment is unauthenticated, and rules cannot be compiled locally either (no `firebase login` credentials, and the Firestore emulator needs a Java runtime that is not installed). Needs Marco to run `firebase login --no-localhost` or supply a service-account JSON. The round-1/3 rule and index changes are live in git only.
*   Set `JOKEHUB_JARVIS_USER_ID` in Vercel env.
*   **Accepted deferrals from round 3** (reviewed and consciously not fixed):
    *   *Comma in a category name breaks the URL round-trip* — `src/lib/jokeFilters.ts` serializes `selectedCategories` with `join(',')` and parses with `split(',')`, so `Dad, jokes` comes back as two names and is dropped as unknown. Fixing it means repeated `categories` params on both sides; the limitation is commented at the code site.
    *   *§1.6 residual rating-aggregate forgery risk* — the rule bounds each aggregate delta but does not cross-check it against the `jokeRatings` collection, so a caller can still nudge a joke's aggregates one plausible rating at a time. Closing it requires moving `submitUserRating` behind an authenticated API route on `adminDb.runTransaction` and restricting joke updates to the owner branch; documented as future work in `firestore.rules:76-86`.

## NEXT (older)
*   (To be defined by the user for Joke Hub application features).
