# Joke Hub — Improvement Round 3 Implementation Plan

> **For Hermes:** Execute task-by-task via Claude Code CLI (`claude -p`, `--model claude-opus-5`).
> One background run per task (implementer), then one read-only review run. Fix loop until review passes.

**Goal:** Apply the prioritized findings from the Opus 5 audit (`docs/audit-2026-08-17.md`) across security, Firestore correctness, architecture refactoring, and design/UX.

**Architecture:** Next.js 16 App Router + TypeScript + ShadCN/Tailwind + Firebase (client SDK + Admin SDK in API routes) + Genkit. State via `JokeContext`/`AuthContext`. Tests via Vitest.

**Source of truth:** `docs/audit-2026-08-17.md` — every task references its section numbers (§). Implementer MUST read the cited sections before editing; the fixes are specified there concretely.

**Baseline (verified 2026-08-17):** `npm run lint` ✅ · `npm run typecheck` ✅ · `npm test` 21/21 ✅

**Universal verification gate for every task:**
```bash
npm run lint && npm run typecheck && npm test
```
All three must pass before committing. Commit per task with the given message.

---

### Task 1: Unblock production Firestore (rules, indexes, batch chunking)

**Objective:** Fix the latent delete failure and declare the composite indexes every filtered query needs.

**Sections:** §1.1, §1.2

**Files:**
- Modify: `firestore.rules` (ratings delete rule — add joke-owner branch)
- Modify: `firestore.indexes.json` (add `jokes` composite indexes: `userId+dateAdded`, `category+dateAdded`, `used+dateAdded`, `funnyRate+dateAdded`, `keywords+dateAdded`, `userId+used+dateAdded`)
- Modify: `src/services/jokeService.ts` (`deleteJoke` — chunk batch at ≤500 writes; `fetchJokes` — add the same `isMissingIndexError` → drop-orderBy + client-sort fallback used by `fetchUserFiveStarJokes`)

**Steps:**
1. Read audit §1.1 and §1.2 fully
2. Implement the rule change, index declarations, batch chunking, and fetch fallback
3. Run the universal gate
4. Commit: `fix: firestore rules/indexes for deletes and filtered queries, batch chunking`

**Note:** actual `firebase deploy --only firestore` is deferred to Task 9.

---

### Task 2: Close the AI endpoints

**Objective:** Authenticate and rate-limit both AI routes; stop auto-generating explanations on page view.

**Sections:** §1.3, §1.4

**Files:**
- Modify: `src/app/api/explain-joke/route.ts` (require auth; load joke server-side and explain stored text; drop caller-supplied `jokeText` from schema)
- Modify: `src/app/api/generate-joke/route.ts` (require auth; rate limit)
- Modify: `src/lib/auth.ts` (`timingSafeEqual` token compare; `^Bearer\s+` header parsing)
- Modify: `src/app/joke/[jokeId]/page.tsx` + `src/components/joke/ExplanationCard.tsx` (explicit "Explain this joke" CTA instead of auto-stream; still auto-display persisted explanations)
- Check existing tests: `verifyApiToken` tests must be updated to the new compare behavior

**Steps:**
1. Read audit §1.3 and §1.4 fully
2. Implement auth (Firebase ID token via `verifyIdToken`, or shared API token) + simple per-IP rate limiting on both routes
3. Gate explanation generation behind explicit click
4. Run the universal gate
5. Commit: `fix: authenticate and rate-limit AI endpoints, on-demand explanations`

---

### Task 3: Firestore correctness and cost

**Objective:** Five independent mechanical fixes to data handling.

**Sections:** §1.5, §1.7, §1.8, §1.9, §2.4

**Files:**
- Modify: `src/services/jokeService.ts` (§1.5 clear `explanation` when text changes in `updateJoke`; §1.7 remove duplicate `getDoc` in `getJokeById`; §1.8 add `toDate` helper, apply everywhere timestamps are mapped)
- Modify: `src/services/ratingService.ts` (§1.8 same helper for `createdAt`/`updatedAt` in `mapRatingDocs`)
- Modify: `src/app/api/jokes/top/route.ts` (§1.9 clamp `limit` to 1–50 and `minRating` to 0–5 with NaN guards)
- Create: `src/services/server/topJokes.ts` (§2.4 reimplement `fetchTopJokes` against `adminDb`; update the route import)

**Steps:**
1. Read audit §1.5, §1.7, §1.8, §1.9, §2.4
2. Implement all five fixes (they are independent — do them one at a time)
3. Run the universal gate
4. Commit: `fix: stale explanations, duplicate reads, timestamp mapping, top-jokes param clamps and admin SDK`

---

### Task 4: Delete dead code + bound the rating-aggregate rule

**Objective:** Remove ~90 lines of unreachable code; constrain rating aggregate writes in the rules.

**Sections:** §1.12, §1.6 (pragmatic option: keep client-side aggregation, bound the rule fields, document the trade-off)

**Files:**
- Modify: `src/services/jokeService.ts` (delete `rateJoke`, `updateJokeCategory`, `SYSTEM_USER_ID` usage)
- Modify: `src/services/ratingService.ts` (delete `getUserRatingForJoke`)
- Modify: `src/contexts/JokeContext.tsx` (delete the corresponding context entries)
- Modify: `src/lib/constants.ts` (delete `SYSTEM_USER_ID`)
- Modify: `firestore.rules` (§1.6 bound `ratingCount`/`averageRating`/`ratingSum` deltas on joke update for non-owners)

**Steps:**
1. Read audit §1.12 and §1.6
2. Grep to confirm zero callers before each deletion
3. Bound the aggregate fields in the `canUpdateJoke` non-owner branch; add a comment documenting the residual risk
4. Run the universal gate
5. Commit: `chore: remove dead service/context code, bound rating aggregate writes in rules`

---

### Task 5: Fix the fetch lifecycle

**Objective:** Eliminate the double-fetch race, add a real categories loading flag, stop the triple round-trip on rating submit.

**Sections:** §2.1, §2.2, §2.3, §1.10

**Files:**
- Modify: `src/contexts/JokeContext.tsx` (§2.1 delete provider auto-fetch effect, add monotonic request-id guard in `fetchJokesInternal`; §2.2 add `loadingCategories: boolean`; §2.3 `submitUserRating` passes `shouldReloadJokesList=false` and patches the single joke in state; §1.10 simplify `handleApiCall` guard + safe error message)
- Modify: `src/app/jokes/page.tsx`, `src/app/page.tsx` (each page owns its fetch)
- Modify: `src/app/add-joke/page.tsx`, `src/app/edit-joke/[jokeId]/page.tsx`, `src/app/manage/page.tsx`, `src/components/add-joke-form.tsx` (replace `loadingInitialJokes` alias with `loadingCategories`)
- Modify: `src/app/joke/[jokeId]/page.tsx` (apply returned aggregates locally instead of refetching)
- Modify: `src/services/ratingService.ts` (return new aggregate values from `submitUserRating`)

**Steps:**
1. Read audit §2.1, §2.2, §2.3, §1.10
2. Implement in order: request-id guard → page-owned fetches → loadingCategories → rating submit flow
3. Run the universal gate
4. Commit: `refactor: page-owned joke fetching, request sequencing, loadingCategories flag, single-round-trip ratings`

---

### Task 6: Decompose `/jokes` and de-duplicate the category combobox

**Objective:** Extract filter logic, dialog, and combobox into reusable units; fix search tokenization.

**Sections:** §2.5, §2.6, §2.7

**Files:**
- Create: `src/lib/jokeFilters.ts` (single `DEFAULT_FILTERS`, `parseFiltersFromParams`, `filtersToSearchParams`, `filtersEqual`)
- Create: `src/hooks/useJokeFilters.ts`
- Create: `src/components/jokes/JokeFilterDialog.tsx` (`{ value, onApply }`, one draft object replacing five `temp*` states)
- Create: `src/components/CategoryCombobox.tsx` + `src/hooks/useUserCategories.ts`
- Modify: `src/app/jokes/page.tsx` (target ~150 lines)
- Modify: `src/components/add-joke-form.tsx`, `src/app/edit-joke/[jokeId]/page.tsx` (use `CategoryCombobox`)
- Modify: `src/services/jokeService.ts`, `src/lib/text.ts` (§2.7 search via `generateKeywords` tokens + clearer empty messaging)
- Delete the duplicated `defaultFilters` in `JokeContext.tsx` / page

**Steps:**
1. Read audit §2.5, §2.6, §2.7
2. Extract pure filter module first, then hook, then dialog, then combobox
3. Rewire pages; verify behavior parity
4. Run the universal gate
5. Commit: `refactor: extract joke filter module/hook/dialog and shared CategoryCombobox, fix search tokenization`

---

### Task 7: Design system pass

**Objective:** Make typography real, reconcile palette docs, fix star rendering and dark-mode alerts.

**Sections:** §3.1, §3.2, §3.3, §3.6

**Files:**
- Modify: `src/app/globals.css` (delete `body { font-family: Arial… }`; correct `--muted-foreground` to `0 0% 40%`)
- Modify: `tailwind.config.ts` (`fontFamily.sans`/`mono` → Geist vars)
- Modify: `context/PROJECT_CONTEXT_HISTORY.md` §Styling Guidelines (describe actual palette: purple primary `270 60% 50%`, gray text scale, pastel accent)
- Modify: `src/components/StarRating.tsx` (fractional fill via clipped overlay; default `starClassName` → `text-primary`)
- Modify: `src/components/add-joke-form.tsx`, `src/components/csv-import.tsx` (replace hardcoded yellow boxes with token-driven `<Alert>` or `dark:` variants)

**Steps:**
1. Read audit §3.1, §3.2, §3.3, §3.6
2. Font/token fixes first (they change the visual baseline), then stars, then alerts
3. Run the universal gate
4. Commit: `fix: wire Geist fonts, fractional star fills, token-driven alerts, palette docs`

---

### Task 8: UX states and accessibility

**Objective:** Skeleton loading instead of full-page spinner, remove fake fallback jokes, fix nested interactives and screen-reader output, per-row CSV reporting.

**Sections:** §3.4, §3.5, §3.7, §1.11

**Files:**
- Modify: `src/app/jokes/page.tsx` + `src/contexts/JokeContext.tsx` (§3.4 keep chrome mounted, scope loading to results grid with card skeletons; full-page spinner only on genuine first paint)
- Modify: `src/app/page.tsx` (§3.5 delete `HARDCODED_JOKES_FALLBACK`, render the existing empty state)
- Modify: `src/app/jokes/page.tsx` (§3.7 move category-remove action out of the combobox trigger) + `src/components/StarRating.tsx` (§3.7 read-only mode → single `role="img"` with aria-label, stars `aria-hidden`)
- Modify: `src/components/csv-import.tsx` + `src/services/jokeService.ts` (§1.11 validate source length client-side, chunk batches ≤500, surface skipped rows in the toast)

**Steps:**
1. Read audit §3.4, §3.5, §3.7, §1.11
2. Implement (depends on Task 5's loading flags)
3. Run the universal gate
4. Commit: `fix: skeleton loading states, remove fake fallback jokes, a11y fixes, per-row CSV import reporting`

---

### Task 9: Lock it in (tests, deploy, docs)

**Objective:** Widen test coverage to the highest-risk pure functions, deploy Firestore rules+indexes, update progress docs.

**Sections:** §2.8, plus deployment of Task 1/4 rule+index changes

**Files:**
- Modify: `vitest.config.mts` (`include: ['src/**/*.test.{ts,tsx}']`, `environment: 'jsdom'`; add `jsdom` devDependency)
- Create: `src/lib/csv.ts` (extract `parseCSVLine` from `csv-import.tsx`) + `src/lib/csv.test.ts`
- Create: `src/lib/jokeFilters.test.ts`, tests for the `toDate` helper and `buildJokesQuery`
- Modify: `src/components/csv-import.tsx` (use extracted parser)
- Modify: `context/PROJECT_PROGRESS.md` (record round 3)
- Run: `firebase deploy --only firestore` — **only after confirming firebase CLI auth works in the pod; if not authenticated, skip deploy and flag to Marco**

**Steps:**
1. Read audit §2.8
2. Widen vitest config, install jsdom, extract parser, write tests (TDD where practical)
3. Run the universal gate — all tests must pass
4. Attempt `firebase deploy --only firestore`; report result honestly
5. Update `PROJECT_PROGRESS.md`
6. Commit: `test: widen vitest coverage (csv, filters, query builder, timestamps); docs: round 3 progress`

---

## Review protocol (per task)

After each implementer run completes:
1. **Spec compliance review** (Claude Code, read-only): does the diff implement every cited audit section, no more, no less? PASS or gap list.
2. **Code quality review** (Claude Code, read-only): conventions, error handling, test coverage, no regressions. APPROVED or REQUEST_CHANGES.
3. Gaps → dispatch a fix run → re-review. Proceed only on PASS + APPROVED.

## Final integration

After Task 9: one final Claude Code review of the whole round-3 diff (`git diff` across all task commits), full baseline gate, then push `master` to origin (repo convention: direct push, no PRs).
