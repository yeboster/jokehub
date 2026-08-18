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

## DONE (2026-08-18, UI/UX round 5 — flows, feedback, IA)
Executed via `docs/plans/2026-08-18-ui-ux-round-5.md` (18 tasks, one commit each, read-only review between each). `npm run lint` ✅ · `npm run typecheck` ✅ · `npm test` **200/200 in 12 files** ✅ · `npx next build` ✅.

**This round changed behaviour, on purpose.** Round 4 was explicitly a no-behaviour-change round; round 5 is the opposite — it exists to fix flows that were wrong, not surfaces that were inconsistent. Every behaviour change, with the task that made it:

*   **A failed save keeps your text (Task 8, `6dd6171`)**: `handleAddJokeAndRedirect` no longer swallows the rejection from `addJoke`. `AddJokeForm` only calls `form.reset()` when the promise resolves, so a failed write used to clear the joke the user had just typed (or generated and then edited) and leave them with a red toast and an empty form. Now every field survives a failure.
*   **Category and permission errors are visible at all (Task 8, `6dd6171`)**: `handleApiCall` suppresses errors matching `Category name cannot be empty` and `permission denied`, on the stated assumption that "the callers surface them in context". No caller did — a category failure produced no user-visible output anywhere in the app. Both forms now set the message on the field it belongs to, and the edit form renders its root error for the first time.
*   **The delete confirmation survives the delete (Task 9, `7b7ea1a`)**: the `AlertDialog` is controlled and `AlertDialogAction` calls `preventDefault()`, so the dialog stays open across the request and stays open if it fails (retry in place). `isDeleting`/`Deleting…` were unreachable before — Radix unmounted the button on click. Escape, overlay click and Cancel are inert while a delete is in flight. Copy: `Are you sure you want to delete this joke?` → `Delete this joke?`, `Cancel` → `Keep it`, `Yes, delete joke` → `Delete joke`.
*   **One toast per action (Task 7, `6436ab2`)**: add, update, delete and rate each fired two toasts, and with `TOAST_LIMIT` at 1 the second evicted the first — so which message the user saw depended on call order. Errors are now announced by `handleApiCall` alone; successes by whichever layer holds the most specific copy (`handleApiCall`'s `successMessage: string` became `success: {title, description} | null`, where `null` means "the caller announces this one"). Titles are sentence case, ≤ 3 words, and destructive ones open with `Couldn't `. The rule is written into `src/hooks/use-toast.ts`, where the next author will look.
*   **Unreachable validation branches deleted or made reachable (Task 7, `6436ab2`; Task 16, `90f7289`)**: the "Please select a star rating (1-5)" toast could never fire (`RatingForm` disables submit at zero stars) and is gone. The auth page's two "Validation Error" toasts could never fire either, because `required`/`minLength` made the browser block the submit first — they are now inline field messages that actually appear.
*   **Active filters are individually removable (Task 10, `9e33343`)**: the six hand-written read-only badges became chips from `activeFilterChips`, each with an × that applies the filter set minus that one filter. Removing one filter is one click instead of reopening the dialog and hunting in a popover, and because it navigates through `applyFilters` it is undoable with the browser back button. "Clear All" is unchanged.
*   **Empty states offer a way out (Task 11, `a3eb22d`; Task 15, `5524a82`)**: `EmptyState` gained an `action` slot and `/jokes` offers "Clear filters" whenever anything is filtered, or "Try again" when the fetch failed. The unfiltered copy changed from "No jokes found. / Try adding some or adjusting your filters!" — which named filters that were not active — to "No jokes here yet. / Add the first one and it shows up right away."
*   **Search is a field on the page, and trimmed (Task 12, `56c205f`)**: it was a control inside the filter dialog, two interactions and one occluding surface deep, for the primary discovery path of a joke collection. It now applies on Enter or on the Search button, and the term is trimmed (the dialog applied it untrimmed). The dialog's search field is gone, along with the magnifier opener that was not a `DialogTrigger` — so Radix now returns focus to the Filters button, and the `setTimeout(…, 100)` focus race is gone.
*   **Scope is a toolbar toggle (Task 13, `edf93b9`)**: All jokes / My jokes is a visible two-button group on `/jokes` instead of a `<Select>` inside the dialog. It is the difference between "the app" and "my collection". The dialog no longer offers scope at all, and the "Login Required" toast that guarded its disabled option is deleted — the toggle is not rendered when signed out, because `useJokeFilters` downgrades `user` scope to `public` for a signed-out visitor anyway.
*   **Back from a joke returns to the feed you left (Task 14, `de367af`)**: the detail page's back button reads the last `/jokes` URL visited in this tab from `sessionStorage`, filters and all, instead of always `router.push('/jokes')`. It is a `<Link>` now, so middle-click and "open in new tab" work. Label: `Back to All Jokes` → `Back to jokes`. A deep link straight to a joke still gets `/jokes`, exactly as before.
*   **A failed feed fetch says so (Task 15, `5524a82`)**: `fetchJokesInternal`'s catch sets `jokes` to `[]`, which is indistinguishable from an empty result — so `/jokes` reported a network failure as "No jokes found. Try adjusting your filters", blaming the user's filters for a dropped connection. A new `jokesError` on `JokeContext` carries the reason; the feed renders the `WifiOff` face, the message and a working "Try again", and the home teaser gets the honest headline without a button (the feed is one click away). The destructive toast is unchanged.
*   **Auth validation moved inline (Task 16, `90f7289`)**: `required`/`minLength` replaced by `noValidate` plus our own checks, so the browser's native bubble is gone and the messages that were written are the messages that show, next to the field they belong to. Auth failures render as a `role="alert"` block instead of a destructive toast — a toast can be dismissed while the wrong password is still in the field. The password can be revealed, `autocomplete` is set on both fields (and switches between `current-password` and `new-password` with the mode), and errors clear as soon as the offending field is edited. The success toast stays.
*   **`/manage` is called Import (Task 17, `c9f12cb`)**: the nav label promised settings and delivered a file input — `Manage`/`Settings` → `Import`/`Upload`. The page title is "Import Jokes", and the "About This Page" card, which spent a whole Card explaining that this page is for bulk import, is one line with a link to `/add-joke`.

**Round-4 deferrals — all six closed**
*   **E1/E4 (Task 2, `eb76f7d`)**: the auth card *is* the page, so its title is now a real `<h1>` at the documented section-title step, and the centring became `flex justify-center items-start` on the canonical container. Six pages, one container — `items-start` because vertical centring fought the container's own `py-*` and pushed the card below the fold on a short phone viewport with the keyboard open.
*   **E2/E3 (Task 1, `6736653`)**: `RatingForm`, `CommunityRatings`, `ExplanationCard`, `csv-import` and four `edit-joke`/`add-joke`/`joke` titles all on `text-lg`. `add-joke-form`'s own `text-xs` label scale is gone, its nested `shadow-none border-0` Card is gone, and the `text-sm` overrides on its two inputs are gone — `Input`/`Textarea` are `text-base md:text-sm` precisely so mobile keeps 16px, and anything under that makes iOS Safari zoom the viewport on focus.
*   **E5 (Task 3, `02ca708`)**: the joke-not-found card is the fourth `EmptyState` — "We couldn't find that joke.", not the interjection "Hmm...".
*   **E6 (Task 4, `e0bccc9`)**: the dark card plane raised to a visible step (figures below).

**Dark-mode contrast after Task 4 — measured, not estimated** (sRGB relative luminance, computed). Round 4's plan overstated its numbers and had to be corrected after the fact; these were computed before the commit:
*   `--card` (`0 0% 16%`) on `--background` (`0 0% 10%`): **≈1.20:1**, up from ≈1.09:1 at 13%. A visible edge without the border doing the work.
*   `--muted-foreground` (`0 0% 63.9%`) on `--card`: **≈5.78:1** (was ≈6.4:1) — clears WCAG AA for body text.
*   `--muted-foreground` on `--muted` (`0 0% 20%`): **≈5.01:1** (was ≈5.4:1) — clears AA.
*   `--muted` on `--card`: **≈1.15:1** — a recessed block still reads.
Both foreground figures move *down* because the backgrounds got lighter; both stay above the 4.5:1 AA floor, which was the constraint. Ordering `background < card < muted < border` is preserved.

**New modules and their suites** (no React testing library in this repo, so logic is extracted into pure `src/lib/` modules and tested there — the same way rounds 3–4 met the obligation):
*   `src/lib/feedEmptyState.ts` + suite (Tasks 11, 15) — `describeEmptyFeed`, the four interacting conditions behind what the feed says when it shows nothing. The error branch outranks all the others.
*   `src/lib/feedReturn.ts` + suite (Task 14) — `rememberFeedUrl`/`readFeedUrl` over an injected `StorageLike`. Validated on both write *and* read: the value round-trips through storage where anything could have put it, so `//evil.example`, `https://evil.example/jokes` and `/jokes-evil` are all refused rather than handed to `<Link>`.
*   `activeFilterChips` in `src/lib/jokeFilters.ts` + cases in the existing suite (Task 10) — each chip carries the filter set that results from dropping exactly that one filter.
*   `src/components/PageLoading.tsx` (Task 5) — thirteen hand-rolled centred-spinner blocks in four layouts, and nine phrasings of "loading", became one component and five labels that each name what is loading. `animate-spin` deliberately keeps turning under `prefers-reduced-motion`, per the round-4 policy: a frozen spinner reads as a hung request.
*   `src/components/joke/BackToFeedButton.tsx` (Task 14) — the href starts at `/jokes` and is upgraded in an effect, because reading `sessionStorage` during render would disagree with the server and trip hydration.
*   **`EmptyState` gained an `action` slot (Task 11)**, deliberately reversing round 4's decision. Round 4 refused a CTA because it would have been a behaviour change and that round forbade them; round 5 allows them, and an empty result set caused by four active filters — or by a failed fetch — needs a way out that is not "work out what you did and undo it". One action, not a toolbar.

**Also in the round**
*   **Touch targets (Task 6, `4f28faf`)**: the toast close button is `opacity-100` below `sm` (there is no hover on a phone, and swipe-to-dismiss is undiscoverable) and keeps its hover-reveal from `sm` up. Interactive stars, the filter-dialog chip ×, "Clear All" and the detail-page Edit button all reach the WCAG 2.5.8 24×24px floor, most of them 36px.
*   **`…` everywhere (Task 5)**: literal `...` in user-visible strings replaced with the ellipsis character.
*   **`loadedFilters` untouched (Task 15)**: `git diff src/contexts/JokeContext.tsx` contains no changed line touching `loadedFilters` — including the `setLoadedFilters(filters)` in the `catch`, which is what stops a failed fetch painting skeletons forever. `jokesError` is a sibling field; the stale-paint guard on both pages is byte-identical.

**Accepted deferrals (round 5, decided up front)**
*   *Renaming `/manage` to `/import`* — Task 17 fixed the nav label, the page title and the filler card. Moving the route means a redirect plus every inbound link, for no additional user-visible gain.
*   *Removing `framer-motion` from `src/app/add-joke/page.tsx`* — third round in a row this is out of scope, and it still is. It stays confined to that one file.
*   *Optimistic updates for rate / toggle / delete* — the current pessimistic writes are *correct*: nothing paints until the write lands, and Task 15 makes failures legible. Optimism buys a few hundred milliseconds and costs a rollback path per action.
*   *An "unsaved changes" guard on the edit form* — it needs route-change interception the App Router does not offer cleanly, and Task 8 removed the case that actually lost data.
*   *A skip-to-content link* — real, but the nav is five controls deep at most. It belongs in an accessibility-focused round with a heading-order and landmark pass.

## NEXT
*   **Deploy Firestore rules/indexes** — `npm run firestore:deploy`. Still not done: the firebase CLI in this environment is unauthenticated, and rules cannot be compiled locally either (no `firebase login` credentials, and the Firestore emulator needs a Java runtime that is not installed). Needs Marco to run `firebase login --no-localhost` or supply a service-account JSON. The round-1/3 rule and index changes are live in git only.
*   Set `JOKEHUB_JARVIS_USER_ID` in Vercel env.
*   **Accepted deferrals from round 3** (reviewed and consciously not fixed):
    *   *Comma in a category name breaks the URL round-trip* — `src/lib/jokeFilters.ts` serializes `selectedCategories` with `join(',')` and parses with `split(',')`, so `Dad, jokes` comes back as two names and is dropped as unknown. Fixing it means repeated `categories` params on both sides; the limitation is commented at the code site.
    *   *§1.6 residual rating-aggregate forgery risk* — the rule bounds each aggregate delta but does not cross-check it against the `jokeRatings` collection, so a caller can still nudge a joke's aggregates one plausible rating at a time. Closing it requires moving `submitUserRating` behind an authenticated API route on `adminDb.runTransaction` and restricting joke updates to the owner branch; documented as future work in `firestore.rules:76-86`.

## NEXT (older)
*   (To be defined by the user for Joke Hub application features).
