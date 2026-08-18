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

## DONE (2026-08-18, design round 4 — motion + visual system)
Executed via `docs/plans/2026-08-18-design-round-4.md` (18 tasks, one commit each, read-only review between each). **No behaviour changed**: no new fetches, no new state feeding a fetch, no changed conditionals. `npm run lint` ✅ · `npm run typecheck` ✅ · `npm test` **167/167 in 10 files** ✅ · `npx next build` ✅.

**Motion**
*   **Motion tokens (Task 1)**: `card-enter` and `shimmer` keyframes plus `ease-emphasized` (`cubic-bezier(0.22, 1, 0.36, 1)`, for things entering) and `ease-standard` (`cubic-bezier(0.4, 0, 0.2, 1)`, for state changes in place) in `tailwind.config.ts`. Every animation this round adds reads these.
*   **Reduced-motion policy (Task 2)**: one unlayered `@media (prefers-reduced-motion: reduce)` block at the end of `src/app/globals.css`, plus `motion-safe:`/`motion-reduce:` variants at the call sites. Deliberately *not* a blanket `* { animation: none }` — `animate-spin` keeps turning, because a frozen spinner reads as a hung request. Closes the WCAG 2.3.3 gap (the codebase previously had zero `prefers-reduced-motion` hits).
*   **Staggered card entrances (Tasks 3–5)**: `src/lib/motion.ts` (`nextStaggerBatch`/`entranceDelayMs`, 40ms step, capped at 12 cards) with its own test suite; a CSS mount animation on `JokeListItem`, so a "Load More" append animates only the appended page. The animation uses `backwards` fill, not `both` — a filled `to` keyframe would outrank the hover-lift and press transforms forever.
*   **Card and button feedback (Tasks 6–7)**: hover lift, press settle and `focus-visible:` (was `focus:`, which left a ring after a mouse click) on joke cards; `motion-safe:active:scale-[0.97]` in `buttonVariants`, so every button in the app acknowledges a press — the only feedback channel that exists on a phone.
*   **Star-rating preview (Task 8)**: `StarRating` fills to the hovered/focused value before you commit, and the hovered star grows. `RatingForm` lost `hover:text-primary/70`, which dimmed the one star under the cursor and read as "disabled". `onRatingChange` fires exactly when it did.
*   **Skeleton shimmer (Task 9)**: `.skeleton-bar` sweeps a highlight across each placeholder via `::after` instead of pulsing the whole card, so the card outline no longer throbs.
*   **Overlay timing (Task 10)**: `DialogOverlay` pinned to `duration-200` to match `DialogContent` (it was falling back to tailwindcss-animate's 150ms and finishing 50ms early on every close); `PopoverContent` given `duration-150`.
*   **Theme toggle (Task 11)**: `relative` added to the trigger — the absolutely positioned Moon icon was resolving against the sticky `<nav>` and only landed correctly because an all-`auto` absolute box stays at its static position. `transition-all` → `transition-transform` with an explicit duration and a reduced-motion opt-out. `disableTransitionOnChange` in `layout.tsx` is untouched on purpose.

**Visual system**
*   **Dark-mode surfaces (Task 12)**: `--card`/`--popover` `0 0% 13%` and `--muted` `0 0% 18%`, so dark mode has an actual card plane. They previously shared `0 0% 10%` with `--background`, and box-shadows are invisible on near-black, so every card was separated from the page by its border alone.
*   **One elevation scale (Task 13)**: in-flow card `shadow-sm` (`hover:shadow-md`), floating surface `shadow-lg`, focal card `shadow-md`. The skeleton card changed in the same commit as the real card, per the skeleton-parity constraint.
*   **One type scale (Task 14)**: page title / description / section title / card title / body, applied at call sites and documented in `src/app/globals.css`. A shared `<Header>` component now renders the page title on `/jokes`, `/add-joke` and `/manage`. No h2 is larger than an h1 any more.
*   **One page container (Task 15)**: `container mx-auto px-4 py-8 sm:px-6 md:py-12` across `/`, `/jokes`, `/joke/[jokeId]`, `/add-joke`, `/manage` (five containers were four different values). The home page reclaimed ~7rem above the fold — `header.mb-12 sm:mb-16` was stacked on the tagline's own `mb-16`.
*   **Mobile filter bar (Task 16)**: `flex-wrap` on the `/jokes` toolbar, the action cluster full-width below `sm`, and the `p-4`/`pb-6` conflict on the same edge resolved. At 375px the Filters button, the active-filter badges and "Log in to Add Jokes" each get their own row instead of being crushed into one.
*   **Shared `EmptyState` (Task 17)**: icon disc + headline + hint, used by `JokeList`, the home teaser and `CommunityRatings` (which were an icon, nothing, and a bare `<p>`). Icon + copy only — a CTA would be new behaviour.
*   **Batch-C review fixes (post-Task 17)**: `empty:hidden` on the `/jokes` badge row (its `basis-full min-h-[36px]` painted an empty 36px band on mobile with no filter active); `ring-1 ring-border` on the `EmptyState` disc; `role="status"` on the `EmptyState` wrapper; `hint` narrowed from `ReactNode` to `string`; the card easing sourced from the Task 1 token via `theme()` instead of a repeated curve.

**Contrast figures — correction to the Task 12 plan text.** The plan's verification note claimed `--muted-foreground` (`0 0% 63.9%`) at ≈8.0:1 on `--card` and ≈7.0:1 on `--muted` in dark mode. The real values are **≈6.4:1 on `--card`** (`0 0% 13%`) and **≈5.4:1 on `--muted`** (`0 0% 18%`). Both still clear WCAG AA for body text (4.5:1) and AA for large text; neither reaches AAA (7:1), which the plan's number implied.

**Accepted deferrals (round 4, decided up front)**
*   *Page-wide colour crossfade on theme change* — `ThemeProvider` sets `disableTransitionOnChange` (`src/app/layout.tsx:44`) to prevent a transition flash on hydration. Trading a first-paint flash for a 200ms crossfade is a bad deal; the round polished the toggle *icon* transition instead (Task 11).
*   *CTAs in empty states* — the scope was "icon + copy". A "Clear filters" button inside `JokeList` would be new behaviour, which the round's first hard constraint forbids.
*   *Removing framer-motion from `src/app/add-joke/page.tsx`* — the AI-variation cards keep their existing block. Removing it is not a polish-round change.

**Deferred to a possible round 5 (plan-level gaps found during the round, all real, none regressions)**
*   *Auth page `CardTitle` is still `text-2xl`* (`src/app/auth/page.tsx:90`) — the documented card-title scale is `text-lg font-semibold`. The auth card was in Task 13's file list for elevation but in no typography task.
*   *`add-joke-form.tsx` keeps its own `text-xs` label scale* (`:99`, `:117`, `:130`, `:148`) — the undocumented fifth scale named in audit item **V3**. Task 14 did not list the file, so it survived the round.
*   *`RatingForm`, `CommunityRatings` and `ExplanationCard` card titles are `text-xl`* (`:41`, `:28`, `:28`), against a documented `text-lg`. Same cause: elevation touched these files, typography did not.
*   *The auth page keeps a sixth container* — `container mx-auto flex justify-center items-center py-12 px-4` (`src/app/auth/page.tsx:87`), not the canonical `px-4 py-8 sm:px-6 md:py-12`. Task 15 listed five pages and `/auth` was not one of them; its centring wrapper needs a decision rather than a substitution.
*   *The joke-not-found card has no icon and no shape* (`src/app/joke/[jokeId]/page.tsx:333-338`) — audit item **V5** named four empty states and Task 17 fixed three. It should become an `EmptyState`.
*   *Dark-mode card/page separation is ≈1.09:1* (`--card` `0 0% 13%` on `--background` `0 0% 10%`). Task 12 made the plane exist, but the lightness step is weak on its own — `border-primary/20` is still carrying the separation. Raising `--card` to ~`0 0% 15–16%` would give a visible edge without shadows; it needs a look at both themes before it is changed, since `--muted` and the "used" card tint sit on top of it.

## NEXT
*   **Design round 5 (optional)** — the six deferred gaps listed at the end of the round-4 section above: three typography call sites, the `add-joke-form` label scale, the auth page container, the joke-not-found empty state, and the weak dark card/page lightness step.
*   **Deploy Firestore rules/indexes** — `npm run firestore:deploy`. Still not done: the firebase CLI in this environment is unauthenticated, and rules cannot be compiled locally either (no `firebase login` credentials, and the Firestore emulator needs a Java runtime that is not installed). Needs Marco to run `firebase login --no-localhost` or supply a service-account JSON. The round-1/3 rule and index changes are live in git only.
*   Set `JOKEHUB_JARVIS_USER_ID` in Vercel env.
*   **Accepted deferrals from round 3** (reviewed and consciously not fixed):
    *   *Comma in a category name breaks the URL round-trip* — `src/lib/jokeFilters.ts` serializes `selectedCategories` with `join(',')` and parses with `split(',')`, so `Dad, jokes` comes back as two names and is dropped as unknown. Fixing it means repeated `categories` params on both sides; the limitation is commented at the code site.
    *   *§1.6 residual rating-aggregate forgery risk* — the rule bounds each aggregate delta but does not cross-check it against the `jokeRatings` collection, so a caller can still nudge a joke's aggregates one plausible rating at a time. Closing it requires moving `submitUserRating` behind an authenticated API route on `adminDb.runTransaction` and restricting joke updates to the owner branch; documented as future work in `firestore.rules:76-86`.

## NEXT (older)
*   (To be defined by the user for Joke Hub application features).
