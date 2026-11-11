# EGM Drift and Code Fixes — Roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the five code issues found by the EGM drift check, then make the 35 `EGM.md` contracts match the code.

**Architecture:** Code first, then docs. Three drift items describe the intended behavior and the code is what is wrong (edit page "Nothing to save", `deploy-firestore.ts` exit path, CSV input reset). Fixing the code in Phase A makes those contract lines true, so Phase B does not touch them. Phase B fixes the false statements first (B1), then fills coverage gaps (B2).

**Tech Stack:** Next.js App Router, React, strict TypeScript, react-hook-form + zod, Vitest (jsdom default), Firebase Admin SDK.

**Spec:** `2026-11-07_DRIFT_REPORT.md` (repo root, untracked). Every item below cites its section there.

## Status of the findings (checked 2026-11-08)

| # | Issue | Checked in code | Where |
| --- | --- | --- | --- |
| 1 | Edit page saves an unchanged joke that has no `source` | yes | `src/app/edit-joke/[jokeId]/page.tsx:92`, `:128` |
| 2 | `firestore:push` with no credentials throws uncaught | yes | `scripts/deploy-firestore.ts:41-48` |
| 3 | CSV non-string read path does not clear the file input | yes | `src/components/csv-import.tsx:66-76` |
| 4 | `useFormField` guard never fires (context default `{}` is truthy; `getFieldState` runs before the check) | yes | `src/components/ui/form.tsx:27-29`, `:49-53` |
| 5 | `tasteStore.ts` header says feedback reads need no composite index | yes | `src/services/server/tasteStore.ts:8-10` vs `:158-171` |

None of these files has a test today except `tasteStore.ts` (`tasteStore.test.ts`). `scripts/firestore-deploy.test.ts` covers the library, not the CLI wrapper.

## Decisions needed before starting

- **D1 — Baseline commit.** Commit the 35 `EGM.md` files as they are now, before any correction, so every later fix is a readable diff. *Recommended: yes.*
- **D2 — Drift report file.** Its line numbers go stale after Phase A. Options: delete it when Phase B is done, or move it to `docs/` and commit it. *Recommended: do not commit; delete after Phase C.*
- **D3 — `src/EGM.md` Firestore layer rule.** Two routes call `adminDb` directly (`api/explain-joke/route.ts:66`, `api/jokes/add/route.ts:3, 43`). Fix the doc, or move those calls into `src/services/server/`. *Recommended: fix the doc now; the move is an architecture change and is out of scope.*
- **D4 — Root `EGM.md` model-runner rule.** `explain-joke-flow.ts:21` calls `ai.generateStream` directly. Fix the doc, or route explanations through the runner (adds fallback and cool-down; changes behavior). *Recommended: fix the doc.*

## Global Constraints

- Node is not on PATH in agent shells. Prefix commands with `export PATH=~/.local/share/mise/installs/node/22.23.3/bin:$PATH;`.
- No live Firebase reads or writes, no `firestore:deploy`/`firestore:push`, no migrations, no paid AI calls. Mock every external boundary.
- Never load, print or copy `.env*` or `firebase-admin-credentials.json`. Task A2's test must mock `dotenv/config` so the local `.env` is not read.
- One focused commit per task. No `Co-Authored-By`, `Claude-Session` or other attribution in commit messages.
- Do not push. Do not edit `README.md` files.
- Contract edits state only what the code shows. Before each edit, open the cited source line and confirm it (line numbers in the report predate Phase A).

## Review Focus

1. **Edit page, existing source cleared.** A joke with `source: 'X'` whose source the user empties must still save. Pinned in Task A1.
2. **Edit page, joke with `source: ''` stored.** Unchanged form must show "Nothing to save". Pinned in Task A1 (table case).
3. **`firestore:push -- --check` with no credentials.** Same clean error and exit 1 as without `--check`. Pinned in Task A2.
4. **CSV non-string read leaves the button usable.** After the toast, the input is reset and not stuck in loading. Pinned in Task A3.
5. **Form primitives inside `FormField`.** The guard fix must not break the normal path (`FormLabel` `htmlFor` = `${id}-form-item`). Pinned in Task A4.

---

## Phase 0 — Baseline (only if D1 = yes)

### Task 0: Commit the generated contracts

- [ ] **Step 1:** `git add EGM.md '**/EGM.md'` and confirm `git status` shows only the 35 `EGM.md` files staged (not the drift report, not this plan).
- [ ] **Step 2:** `git commit -m "docs: add EGM contracts for every code folder"`

---

## Phase A — Code fixes (TDD, one commit each)

### Task A1: Edit page — unchanged joke without a source

**Files:**
- Modify: `src/app/edit-joke/[jokeId]/page.tsx:128`
- Create: `src/app/edit-joke/[jokeId]/page.test.tsx`

**Interfaces:** consumes `useJokes()` → `{ getJokeById, updateJoke, deleteJoke, loadingCategories }`, `useAuth()` → `{ user, loading }`, `useParams()` → `{ jokeId }`.

- [ ] **Step 1: Write the failing tests.** Follow `src/app/add-joke/page.test.tsx` (hoisted `mocks`, `createRoot` + `act`, `IS_REACT_ACT_ENVIRONMENT`). Mock `@/contexts/AuthContext`, `@/contexts/JokeContext`, `next/navigation` (`useParams: () => ({ jokeId: 'j1' })`, `useRouter: () => ({ push })`), `@/hooks/use-toast`, and stub `@/components/header` and `@/components/CategoryCombobox` as plain components. User `{ uid: 'u1' }`. Submit with `container.querySelector('form')!.requestSubmit()` inside `act`, then flush.

  Table-driven, `describe('submit without changes')`:

  | stored `source` | user edit | expect |
  | --- | --- | --- |
  | `undefined` | none | toast `'Nothing to save'`, `updateJoke` not called |
  | `''` | none | toast `'Nothing to save'`, `updateJoke` not called |
  | `'Book'` | none | toast `'Nothing to save'`, `updateJoke` not called |
  | `'Book'` | clear source input to `''` | `updateJoke('j1', expect.objectContaining({ source: '' }))` |
  | `undefined` | type `'Radio'` into source | `updateJoke('j1', expect.objectContaining({ source: 'Radio' }))` |

  Base joke: `{ id: 'j1', userId: 'u1', text: 'A joke', category: 'Work', used: false, funnyRate: 0, dateAdded: new Date(0) }`.

- [ ] **Step 2: Run and confirm RED.** `npm test -- 'src/app/edit-joke/[jokeId]/page.test.tsx'`. Expected: only the `undefined`/none row fails, because `updateJoke` was called.
- [ ] **Step 3: Fix.** In `onSubmit`, compare `(data.source ?? '') === (joke.source ?? '')`.
- [ ] **Step 4: GREEN.** Same command; all rows pass.
- [ ] **Step 5: Prove regression protection.** Revert line 128 only, confirm the `undefined` row fails, restore, rerun.
- [ ] **Step 6: Commit.** `fix(edit-joke): treat a missing source as empty when checking for changes`

### Task A2: `deploy-firestore.ts` — missing credentials exit cleanly

**Files:**
- Modify: `scripts/deploy-firestore.ts:48-53`
- Create: `scripts/deploy-firestore.test.ts`

- [ ] **Step 1: Write the failing tests** (`// @vitest-environment node`). Mocks: `vi.mock('dotenv/config', () => ({}))`; `vi.mock('./firestore-deploy', …)` with `deployFirestore: vi.fn(async () => {})` and `credentialsFromServiceAccount: vi.fn()`; `vi.mock('fs', …)` with `default: { existsSync: () => false, readFileSync: vi.fn() }`. `vi.stubEnv` the three `FIREBASE_*` vars to `''`. Spy `process.exit` (`mockImplementation(() => undefined as never)`) and `console.error`. `vi.resetModules()` before each test; load with `await import('./deploy-firestore')`, then flush with `await new Promise(r => setTimeout(r, 0))`.
  - `missing credentials prints the message and exits 1` — for `argv` with and without `--check`: `console.error` called with `expect.stringContaining('No Firebase admin credentials found')`, `process.exit` called with `1`, `deployFirestore` not called.
  - `env credentials are passed to deployFirestore` — stub the three vars to `'p'`, `'e'`, `'k\\nk'`: `deployFirestore` called with `{ projectId: 'p', clientEmail: 'e', privateKey: 'k\nk' }, { checkOnly: false }`; `process.exit` not called.
- [ ] **Step 2: RED.** `npm test -- scripts/deploy-firestore.test.ts`. Expected: the missing-credentials cases fail because the `import` itself rejects with "No Firebase admin credentials found". The env case passes.
- [ ] **Step 3: Fix.** Wrap the call in `async function main(): Promise<void>` that awaits `deployFirestore(readCredentials(), { checkOnly: process.argv.includes('--check') })`; call `main().catch(...)` with the existing handler.
- [ ] **Step 4: GREEN**, then **Step 5:** revert to the old call, confirm RED, restore.
- [ ] **Step 6: Commit.** `fix(scripts): report missing Firestore credentials through the error handler`

### Task A3: CSV import — clear the input on an unreadable file

**Files:**
- Modify: `src/components/csv-import.tsx:66-76`
- Create: `src/components/csv-import.test.tsx`

- [ ] **Step 1: Write the failing test.** Mock `@/contexts/AuthContext` (`user: { uid: 'u1' }`), `@/hooks/use-toast`, `next/link`. Stub `FileReader` with a class whose `readAsText()` calls `this.onload?.({ target: { result: new ArrayBuffer(1) } })`. Render `<CSVImport onImport={vi.fn()} />`. On the `input[type=file]`: `Object.defineProperty(input, 'files', { value: [new File(['x'], 'a.csv')] })` and `Object.defineProperty(input, 'value', { configurable: true, get: () => 'C:\\fakepath\\a.csv', set: setValue })`. Dispatch `new Event('change', { bubbles: true })` inside `act`.
  - `unreadable file content resets the input`: toast title `"Couldn't read that file"`; `setValue` called with `''`; input not `disabled`.
  - Characterization: `signed-out attempt resets the input` (user `null`): `setValue` called with `''`.
- [ ] **Step 2: RED.** `npm test -- src/components/csv-import.test.tsx`. Expected: first test fails on `setValue` not called.
- [ ] **Step 3: Fix.** In the `typeof text !== 'string'` branch, add `if (fileInputRef.current) fileInputRef.current.value = '';` before `return`, matching lines 189-191.
- [ ] **Step 4: GREEN**, **Step 5:** revert-and-confirm, restore.
- [ ] **Step 6: Commit.** `fix(csv-import): reset the file input when the file cannot be read`

### Task A4: `useFormField` guard

**Files:**
- Modify: `src/components/ui/form.tsx:27-29`, `:44-53`
- Create: `src/components/ui/form.test.tsx`

- [ ] **Step 1: Write the failing tests.** A `Harness` calls `useForm()` and renders `<Form {...form}>…</Form>`. Catch render errors with a small class error boundary that stores `error.message`; spy `console.error` to silence React's report.
  - `FormLabel outside FormField throws a clear error`: `<FormItem><FormLabel>Name</FormLabel></FormItem>` → captured message is `'useFormField should be used within <FormField>'`.
  - `FormLabel inside FormField links to its control`: `<FormField name="name" render={() => <FormItem><FormLabel>Name</FormLabel><FormControl><input /></FormControl></FormItem>} />` → label `htmlFor` equals the input `id`, and it ends with `-form-item`.
- [ ] **Step 2: RED.** `npm test -- src/components/ui/form.test.tsx`. Expected: first test fails (no error, or a different message).
- [ ] **Step 3: Fix.** `React.createContext<FormFieldContextValue | null>(null)`; in `useFormField`, run the `!fieldContext` check before `getFieldState`. Leave `FormItemContext` unchanged (not part of the finding).
- [ ] **Step 4: GREEN**, **Step 5:** revert-and-confirm, restore.
- [ ] **Step 6: Commit.** `fix(ui/form): make the useFormField guard reachable`

### Task A5: `tasteStore.ts` header comment

Comment-only change; the exception to TDD applies. Validation: `npm test -- src/services/server/tasteStore.test.ts` still passes and the diff touches only the header.

- [ ] **Step 1:** Replace lines 8-10 with: per-user feedback reads use the `(userId, updatedAt desc)` composite index from `firestore.indexes.json`, with an unordered fallback until it is deployed; samples use a single-field `orderBy` and need no composite index.
- [ ] **Step 2: Commit.** `docs(tasteStore): describe the feedback index the reads now use`

---

## Phase B — Contract corrections (documentation only)

Validation for every B task, instead of a failing test: re-open each cited source line before editing; after editing, check relative links resolve, code fences are balanced, and `git diff --check` is clean. One commit per task.

Items resolved by Phase A, **no contract edit**: `scripts/EGM.md` (exit path, A2), `src/components/EGM.md` "value is cleared after every attempt" (A3), `src/app/edit-joke/[jokeId]/EGM.md` "Nothing to save" (A1), `src/services/server/EGM.md` stale comment (A5).

### Task B1: Fix false statements

These are the lines a reader would act on and get wrong. Report section in brackets.

- [ ] `EGM.md` [EGM.md]: model-runner rule limited to joke generation; explanations call `ai.generateStream` directly (per D4). `localStorage` also holds the next-themes `theme` key. API auth accepts ID tokens and the shared `JOKEHUB_API_TOKEN`; `verifyApiToken` accepts only the token (`/api/jokes/add`, `/api/jokes/top`).
- [ ] `src/EGM.md`: Firestore access also happens in the two routes named in D3 (per D3).
- [ ] `src/ai/EGM.md`: `genkit:watch` runs `genkit start -- tsx --watch src/ai/dev.ts`.
- [ ] `src/ai/flows/EGM.md`: exhaustion — time budget used before any attempt throws `MODELS_UNAVAILABLE_ERROR`; `CALL_LIMIT_ERROR` only when the call cap is hit with no recorded failure.
- [ ] `src/ai/prompts/EGM.md`: `criticTasteSection(taste: TasteProfile | undefined)`; the "reference data" framing is triggered by `prefilledJokes`, `exemplarJokes`, `recentGeneratedJokes`, `avoidJokes` only.
- [ ] `src/lib/EGM.md`: add `TASTE_LIMITS.reasonChars` (200); drop the inferred type for `TasteDocIdSchema`, add `FeedbackUpsertInput`; empty normalized keys are never near-duplicates; search tokens strip only `. , ! ? ; : ( ) " '` and backtick; first request's `retryAfterSeconds` is `Math.ceil(windowMs / 1000)`.
- [ ] `src/app/EGM.md`: `GlobalError` button calls `reset`, it does not reload.
- [ ] `src/app/auth/EGM.md`: `looksLikeEmail` needs `@` not first, at least one character between `@` and the following `.`, and `.` not last.
- [ ] `src/app/joke/[jokeId]/EGM.md`: `streamExplanation` is a `useCallback` inside `JokeShowPage`.
- [ ] `src/app/api/generated-joke-feedback/EGM.md`: GET and DELETE failures also log via `console.error('[taste-api]', …)`.
- [ ] `src/components/joke/EGM.md`: `CopyLinkButton` clears the reset timer after `copyToClipboard` resolves.
- [ ] `src/components/ui/EGM.md`: every file except `toaster.tsx` uses `cn`.
- [ ] `src/services/EGM.md`: unrated band (0) never degrades; the two fallbacks can both apply in one call; `updateJoke` regenerates `keywords` whenever `text` is in the patch and clears `explanation` only if the text changed.
- [ ] `src/services/server/EGM.md`: `createdAt` kept only when the existing doc parses; second exemplar query also runs when the pool is short or has fewer than 2 categories; `updateSample` returns `null` also for a malformed existing doc.
- [ ] `scripts/joke-evaluation/EGM.md`: `summarize` return also has `schemaVersion: 1` and `packetId`.
- [ ] **Commit:** `docs(egm): correct contract statements that contradict the code`

### Task B2: Root, `src`, `scripts`, `ai` coverage gaps

- [ ] `EGM.md`: `firestore.rules` non-owner bounded rating update and `jokeRatings` delete by rating or joke owner; `jokeExemplars.ts` also reads `generatedJokeFeedback`; full env var list; full ESLint ignores and `eol-last: error`; `tailwindcss-animate`.
- [ ] `src/EGM.md`: `app` summary includes `robots.ts`, `sitemap.ts`, `error.tsx`, `global-error.tsx`, `not-found.tsx`.
- [ ] `scripts/joke-evaluation/EGM.md`: the two `summarize` throws; CLI option parsing rules.
- [ ] `src/ai/flows/EGM.md`: cool-down blame rule, parser-error rethrow, selection reference set, classic critic note, progress stages, `selected` log.
- [ ] **Commit:** `docs(egm): document uncovered behavior in root, src, scripts and ai contracts`

### Task B3: `lib` and `services` coverage gaps

- [ ] `src/lib/EGM.md`: `mergeUniqueJokeTexts` skips empty keys; stream frame rejections; `warnMissingIndex` fallback text.
- [ ] `src/services/EGM.md`: `ensureCategoryExists` exact match; `subscribeToUserCategories` trim and generic error; `fetchAllRatingsForJoke` error wrapping; `submitUserRating` not-found and comment trimming.
- [ ] `src/services/server/EGM.md`: `listSamples` query; `mode`/`requestId` merge; id-prefix filter; sample fields; `text`/`jokeText` and `validText`; downvote reader scope; 60 s cache behavior.
- [ ] **Commit:** `docs(egm): document uncovered behavior in lib and services contracts`

### Task B4: `app` pages and API routes coverage gaps

- [ ] `src/app/EGM.md`: `SITE_DESCRIPTION` metadata and Geist font.
- [ ] `src/app/add-joke/EGM.md`: edit locked while saving; "Joke saved" toast link.
- [ ] `src/app/api/generate-joke/EGM.md`: extra headers; fields of `heartbeat`/`result`/`error` frames; `ContextTextSchema` rules.
- [ ] `src/app/api/generated-joke-feedback/EGM.md`: `internalError` 500 for GET/DELETE; API-token feedback stored under `'api-user'`.
- [ ] `src/app/auth/EGM.md`: field errors use `role="alert"`.
- [ ] `src/app/edit-joke/[jokeId]/EGM.md`: "Joke not found." and "Failed to load joke data." states.
- [ ] **Commit:** `docs(egm): document uncovered behavior in app contracts`

### Task B5: `components`, `contexts`, `hooks` coverage gaps

- [ ] `src/components/EGM.md`: add-joke save-failure handling; focus after save; CSV status region; `funnyrate` parsing; navigation links; Navbar loading state; `StarRating` preview; missing defaults; staggered entrance and "No ratings yet".
- [ ] `src/components/joke/EGM.md`: `RatingForm` loading and button label; `CommunityRatings` loading and empty states.
- [ ] `src/components/joke-studio/EGM.md`: `TastePanel` toggle and Reset disabled rule; `SamplesPanel` disabled rules; `GenerationControls` catalog use.
- [ ] `src/contexts/EGM.md`: sign-out success toast; category failure toast; initial `loadingInitialJokes`/`hasMoreJokes`.
- [ ] `src/hooks/EGM.md`: list fetch on mount; `useJokeGeneration` JSON path.
- [ ] **Commit:** `docs(egm): document uncovered behavior in components, contexts and hooks contracts`

---

## Phase C — Final checks

- [ ] `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `git diff --check`. Report each result.
- [ ] Optional, needs your OK (it starts subagents): re-run the EGM drift check on the 23 contracts that had findings and confirm no item from the report is still open.
- [ ] Apply D2 to the drift report.

## Not planned — noted in the report, needs a decision first

- `fetchJokeExemplars` and `fetchAvoidExamples` cache empty results for 60 s after a swallowed read failure, while `fetchLibraryJokeTexts` does not (`jokeExemplars.ts:96, 134, 149-150`). The report does not say whether this is intended.
- The downvote reader reads downvotes from all users (`jokeExemplars.ts:108-112`). The report does not say whether this is intended.
