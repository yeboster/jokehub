# Joke Studio: reliable models, better jokes, multi-save, feedback and samples

Date: 2026-11-07. Status: approved for autonomous build (owner said "be autonomous, I trust you",
then "commit and push so that it is released").

## Why

The owner generates jokes on `/add-joke`, reviews them, keeps the good ones. Today:

1. Most models fail. Only Gemini 3.5 Flash-Lite works reliably for them. The others "don't load
   and give an error", sometimes but not always.
2. Only one joke per batch can be kept. Picking one fills the form; saving it redirects to
   `/jokes` (`src/app/add-joke/page.tsx:218`) and the batch, topic and settings are lost.
3. There is no way to tell the AI what they like. (Verified: no thumbs up/down exists in `src/`;
   nothing about generated jokes is stored. The only taste signal is the one-shot
   "Load my 5-star jokes" button.)
4. They want reusable sample jokes that steer generation, addable at any time.
5. Joke quality should improve.

Success: the owner opens the studio, generates batch after batch with any listed model, saves
every good joke with one click without leaving the page, votes on jokes, and later batches
visibly reflect those votes and their samples.

Anti-goals: a save that silently fails; losing a batch or form text; feedback that cannot be
removed; models that appear in the list but cannot work; leaking prompts, joke text or provider
messages into logs.

## Facts this design rests on

- Google model docs (aistudio.google.com/docs/models and /docs/deprecations, read 2026-11-07):
  `gemini-3.8-flash` new; `gemini-3.6-flash` stable; `gemini-3.5-flash-lite` stable;
  `gemini-3.1-flash-lite` stable, shutdown May 7 2027; `gemini-3.7-flash` and `gemini-3.5-flash`
  "no longer in AI Studio; endpoint auto-routes"; `gemini-2.5-flash` deprecated, routed to
  3.5-flash-lite from Dec 1 2026.
- No Gemini key exists locally, so live availability for the owner's key was **not** verified.
  Why 3.6/3.7 fail for the owner is unknown. Candidate causes the code can defend against:
  provider 5xx/429, model IDs routed or removed, structured output with the wrong number of items
  (current schema demands exactly 6 candidates and exactly 6 rankings, else the request fails),
  and slow responses.
- `@genkit-ai/google-genai@1.41.0` forwards unknown `gemini-*` names to the API; provider HTTP
  errors surface as `GenkitError` with `status` (`RESOURCE_EXHAUSTED` 429, `INVALID_ARGUMENT` 400,
  `INTERNAL` 500, `UNAVAILABLE` 503, else `UNKNOWN`) and a message containing `[<http code> ...]`.
  Gemini config accepts `thinkingConfig.thinkingLevel: MINIMAL|LOW|MEDIUM|HIGH`.
  `ai.generate` accepts `abortSignal`.
- Firestore rules have no `users/**` match, so client access there is denied by default; the
  Admin SDK bypasses rules. Single-field `orderBy` needs no composite index. Therefore the new
  storage below needs **no rules or index deploy**.

## Architecture

```
add-joke page (client)
 ├─ GenerationControls ── POST /api/generate-joke (NDJSON stream)
 │                          └─ route: auth → rate limit → exemplars + loadTasteProfile(uid)
 │                               └─ generateJoke flow: model chain w/ fallback
 │                                    generate 2×count candidates → critic → select count
 ├─ GeneratedBatches/Card ─ Save → JokeContext.addJoke (client SDK, unchanged rules)
 │                        ─ 👍/👎/saved → PUT /api/generation-feedback
 ├─ SamplesPanel ────────── /api/joke-samples (GET/POST/PATCH/DELETE)
 └─ AddJokeForm (stays on page after save)

server: src/services/server/tasteStore.ts (Admin SDK) → users/{uid}/generationFeedback/{id}
                                                      → users/{uid}/jokeSamples/{id}
client: src/services/tasteService.ts (fetch + Firebase ID token)
shared: src/lib/tasteProfile.ts, src/lib/jokeGenerationContract.ts, src/ai/models.ts,
        src/lib/generationProgress.ts
```

Three workstreams after a shared-contract commit: **A** AI engine, **B** taste persistence,
**C** studio UI. Contract files are written first and are owned by nobody afterwards except by
agreement (additive changes only).

## Shared contracts (commit 0)

### `src/ai/models.ts`

Catalog with id, label, short description, `thinkingLevel?`:

| id | label | description | thinkingLevel |
|---|---|---|---|
| `googleai/gemini-3.6-flash` | Gemini 3.6 Flash | Best balance of wit and speed | LOW |
| `googleai/gemini-3.8-flash` | Gemini 3.8 Flash | Newest; can be busier | LOW |
| `googleai/gemini-3.5-flash-lite` | Gemini 3.5 Flash-Lite | Fastest and most reliable (default) | — |
| `googleai/gemini-3.1-flash-lite` | Gemini 3.1 Flash-Lite | Backup; retires May 2027 | — |

- `GEMINI_MODELS` (tuple), `GeminiModel`, `GEMINI_MODEL_LABELS` stay exported (derived).
- `DEFAULT_GENERATE_MODEL = gemini-3.5-flash-lite`; `EXPLAIN_MODEL = gemini-3.5-flash-lite`.
  (My call: the owner reports it is the only model that works reliably for them; 3.6 Flash stays
  one click away and the UI remembers the last choice.)
- `LEGACY_MODEL_ALIASES`: `gemini-3.7-flash→3.8-flash`, `gemini-3.5-flash→3.6-flash`,
  `gemini-2.5-flash→3.5-flash-lite`. API callers sending a legacy id keep working.
- `resolveModelId(value)`: catalog id or legacy alias → catalog id; otherwise `null`.
- `modelChain(selected)`: `[selected, ...FALLBACK_ORDER without selected]`, max 3, where
  `FALLBACK_ORDER = [3.5-flash-lite, 3.1-flash-lite, 3.6-flash]`.
- `thinkingLevel` is only set for flash (non-lite) models: unverified for lite models, which
  already work without it. (My call.)

### `src/lib/jokeGenerationContract.ts` (additive)

- `JOKE_GENERATION_LIMITS` gains `minCount: 1`, `maxCount: 5`, `defaultCount: 3`,
  `tasteSamples: 10`, `tasteLiked: 10`, `tasteDisliked: 10`, `tasteReasonChars: 200`.
- `JOKE_STYLES`: `any, one-liner, pun, observational, absurd, dad-joke, q-and-a` with labels.
- `GenerationResultSchema` (zod, client-safe): `{ jokes: JokeVariation[1..maxCount], model:
  string, requestedCount: int }`. `JokeVariation = { jokeText, category }`.

### `src/lib/generationProgress.ts` (additive)

- New stage `fallback` → label "Switching to a backup model".
- Progress frames may carry `model?: string`.
- `MAX_GENERATION_CALLS = 10` replaces the hardcoded `callCount > 4` check.

### `src/lib/tasteProfile.ts`

Zod schemas and types shared by B and C, plus the A-facing `TasteProfile`:

```ts
type FeedbackVote = 'up' | 'down';
FeedbackUpsertSchema = { jokeText, category?, vote?: 'up'|'down'|null, reason?: string|null (≤200),
                         saved?: boolean, topicHint? (≤500), model? (≤100) }
  // vote undefined = unchanged, null = clear; saved undefined = unchanged.
GenerationFeedback = { id, jokeText, category?, vote: FeedbackVote|null, reason?, saved: boolean,
                       topicHint?, model?, updatedAt: ISO string }
SampleCreateSchema = { text (≤2000, non-empty after normalize), note? (≤200) }
SampleUpdateSchema = { id: /^[a-f0-9]{32}$/, active?: boolean, note?: string|null }
JokeSample = { id, text, note?, active: boolean, createdAt: ISO, updatedAt: ISO }
TasteProfile = { samples: string[]; liked: {text, reason?}[]; disliked: {text, reason?}[] }
emptyTasteProfile()
TASTE_LIMITS = { maxSamples: 50, feedbackPage: 100, reasonChars: 200, noteChars: 200 }
```

### Stubs

`src/services/server/tasteStore.ts` and `src/services/tasteService.ts` with the final signatures
(below) and `throw new Error('not implemented')` bodies, except `loadTasteProfile` which returns
`emptyTasteProfile()`, so A and C compile against them while B implements them.

## A. AI engine (generation quality + reliability)

Owns: `src/ai/flows/*`, `src/ai/prompts/*`, `src/app/api/generate-joke/route.ts`, their tests,
README generation/logging section.

### Request contract (`POST /api/generate-joke`)

Existing fields unchanged. New optional fields: `count` (int 1–5, default 3), `style`
(`JOKE_STYLES` key, default `any`), `useTasteProfile` (bool, default true). `model` accepts
catalog ids and legacy aliases (resolved via `resolveModelId`; unknown → 400). Taste is loaded
server-side with `loadTasteProfile(uid)` only for `via === 'id-token'` callers and only when
`useTasteProfile !== false`; it never fails the request (empty profile on error).

Backward compatibility (my call): partial batches are only allowed when the request sends `count`.
Without `count`, behavior stays "exactly 3 or `INSUFFICIENT_JOKES`" for existing API-token callers;
the new `model`/`requestedCount` fields are additive.

Result frame / JSON body: `GenerationResultSchema` (`jokes` 1..count, `model` = the model that
produced the candidates, `requestedCount`). Progress frames include `model` when known; a
`fallback` stage is sent when switching models. Error codes add `MODELS_UNAVAILABLE`
("All models are busy right now. Please try again in a minute.").

### Reliability

- Every `ai.generate` goes through one helper that walks `modelChain(selected)`. The chain is
  sticky: after a fallback, later calls in the same request start from the model that worked.
- Cross-request cool-down (my call): a model that fails with a fallback-eligible error is marked
  cooling for 5 minutes in a module-level map (per server instance). While cooling it is moved to
  the end of the chain, so a broken default does not cost every request a timeout. Never
  persisted; a success clears it. Injectable clock for tests.
- Fallback on: `GenkitError` statuses `UNAVAILABLE`, `RESOURCE_EXHAUSTED`, `INTERNAL`,
  `DEADLINE_EXCEEDED`, `UNKNOWN`, `NOT_FOUND`, `INVALID_ARGUMENT`; per-attempt timeout; empty or
  unusable structured output. Never on client abort. Total calls ≤ `MAX_GENERATION_CALLS`.
- Time budget (my call; the hosting platform and its timeout are not visible in the repo):
  whole request ≤ 90 s (`GENERATION_BUDGET_MS`). Per-attempt timeouts via `abortSignal` combined
  with the request signal: generation 35 s, critic 25 s, each capped by the remaining budget; a
  fallback attempt is skipped when less than 10 s remain. The route exports
  `maxDuration = 120`.
- `config.thinkingConfig.thinkingLevel` from the catalog when set.
- Logs gain `providerStatus` (GenkitError status) and `httpStatus` (parsed `[NNN` digits only) on
  failed attempts, plus `fromModel`/`toModel` on fallback. Never the provider message, prompt or
  joke text.

### Tolerant parsing and selection

- Candidate output: ask for `2 × count` candidates (6 or 10). Accept arrays of ≥ count items;
  keep the first `2 × count` unique by `normalizeJokeKey`; fewer than `count` unique = unusable
  output (fallback).
- Candidates carry internal `premise` and `mechanism` (short strings) to force planning and
  diversity; they are stripped from the public output.
- Critic: rankings with invalid, duplicate or missing indices are tolerated (first valid ranking
  per index wins; unranked candidates are ineligible). Zero valid rankings = critic failure
  (fallback to next model; after the chain is exhausted, `QUALITY_CHECK_FAILED`).
- `selectJokes` generalises from triples to `count`: pick the eligible subset of size
  `min(count, eligible)` maximizing the existing objective (score sum minus premise/mechanism
  redundancy penalties, scaled to subset size). At least 1 eligible joke returns a partial batch;
  0 eligible = `INSUFFICIENT_JOKES`.
- Existing safety/originality/fit gates and the optional repair pass stay, generalised to count.

### Quality

- Rewrite the generator prompt: pick a concrete angle per candidate first, then write; spread
  candidates across distinct mechanisms (misdirection, double meaning, literal reading, reversal,
  escalation, understatement, analogy, callback); land the punch on the last word; no
  explanations. Honor `style` when not `any`.
- Taste profile section (reference data, not instructions): samples and liked jokes as style
  targets ("match the craft, not the material"); disliked jokes with reasons as patterns to avoid.
  Samples and liked texts join the reference set for copy detection.
- Critic: when a taste profile exists it is the strongest signal; reward craft similar to
  samples/liked, penalize resemblance to disliked patterns and stated reasons.
- Existing exemplar/prefill/recent context stays.

## B. Taste persistence

Owns: `src/services/server/tasteStore.ts`, `src/app/api/generation-feedback/route.ts`,
`src/app/api/joke-samples/route.ts`, `src/services/tasteService.ts`, their tests.

### Storage (Admin SDK only)

- `users/{uid}/generationFeedback/{id}`, `id` = first 32 hex chars of
  `sha256(normalizeJokeKey(jokeText))`. Fields: `jokeText, category?, vote ('up'|'down'|null),
  reason?, saved (bool), topicHint?, model?, createdAt, updatedAt` (server timestamps).
  Upsert merges; when the merged doc has `vote === null && saved === false` it is deleted.
- `users/{uid}/jokeSamples/{id}`, same id scheme. Fields: `text, note?, active (bool, default
  true), createdAt, updatedAt`. Max 50 samples (`SAMPLE_LIMIT` error → 409). Creating an existing
  sample returns it (`created: false`), re-activating it.

### Server API (`tasteStore.ts`)

```ts
upsertFeedback(uid, input: FeedbackUpsert): Promise<GenerationFeedback | null>  // null = deleted
listFeedback(uid, limit = 100): Promise<GenerationFeedback[]>                  // updatedAt desc
clearFeedback(uid): Promise<number>
listSamples(uid): Promise<JokeSample[]>                                         // createdAt desc
createSample(uid, input: SampleCreate): Promise<{ sample: JokeSample; created: boolean }>
updateSample(uid, input: SampleUpdate): Promise<JokeSample | null>
deleteSample(uid, id): Promise<boolean>
loadTasteProfile(uid): Promise<TasteProfile>   // never throws; caps from JOKE_GENERATION_LIMITS
```

`loadTasteProfile`: active samples (newest first, ≤10); from the newest 100 feedback docs,
liked = `vote === 'up' || (saved && vote !== 'down')` (≤10), disliked = `vote === 'down'` (≤10),
with reasons. Texts validated with the existing context-text rules.

### HTTP

- `GET /api/generation-feedback?limit=` → `{ feedback, counts: { liked, disliked } }`;
  `PUT` (FeedbackUpsertSchema) → `{ feedback: GenerationFeedback | null }`;
  `DELETE` → `{ deleted: number }`.
- `GET /api/joke-samples` → `{ samples }`; `POST` → `{ sample, created }` (201/200);
  `PATCH` → `{ sample }` (404 if missing); `DELETE ?id=` → `{ deleted: boolean }`.
- Auth: `verifyRequestAuth`; only `via === 'id-token'` (API-token callers get 403: they have no
  user). Rate limit per user and scope: 60 requests / minute. Errors `{ error, code }`; never
  echo stored text in error messages or logs.

### Client (`tasteService.ts`)

Functions take a `TokenSource = { getIdToken(): Promise<string> }` (a Firebase `User` satisfies
it): `listFeedback, setFeedback, clearFeedback, listSamples, createSample, updateSample,
deleteSample`. Responses are parsed with the shared schemas; non-OK throws `Error(server error)`.

## C. Studio UI

Owns: `src/app/add-joke/page.tsx` (+test), `src/components/add-joke-form.tsx`,
`src/components/joke-studio/*`, new hooks in `src/hooks/`, `JokeContext.addJoke` and
`jokeService.addJoke` return values.

- **No redirect after save.** The form resets and stays; focus returns to the joke text field;
  one toast "Joke saved" with a "View" action linking to `/joke/{id}`. `jokeService.addJoke`
  returns the new id; `JokeContext.addJoke` returns `Promise<string | undefined>`; exactly one
  layer announces success. Topic, model, temperature, style, count and batches are untouched.
- **Batches.** Each generation prepends a batch (`id, createdAt, topicHint, style, model, jokes`);
  the last 5 are kept, older batches collapsed; stored in `sessionStorage` per uid (try/catch,
  render fine without it). Partial batches show "Only N passed the quality check".
- **Card actions** (each with an accessible name): Save (direct save with AI category, source
  "AI Assistant"; then shows "Saved" + View link; double-save prevented); Edit (fills the form;
  saving from the form marks that card saved; the feedback record uses the text actually saved,
  i.e. the edited version — my call); 👍/👎 toggles (`aria-pressed`) with an optional
  short reason field after a vote; "Add as sample". Votes and saves call `setFeedback`
  (saved: true on save). Feedback failures show a non-blocking toast and revert the toggle.
- **Controls.** Model select shows label + description; last choice remembered in
  `localStorage` (validated against the catalog); count (3 or 5); style select; switches
  "Use my samples & feedback" (`useTasteProfile`). The model that produced a batch is shown on
  the batch; a fallback is visible in progress text.
- **Samples panel.** List with active switch, note, delete; add by typing; "Import my 5-star
  jokes" (uses `fetchUserFiveStarJokes`, creates samples, reports added/skipped); taste summary
  "Learning from N likes and M dislikes" with "Reset feedback" (confirm dialog), and an
  expandable "Your feedback" list (from `listFeedback`) where each item can be removed
  (`setFeedback` with `vote: null, saved: false`). My call, so feedback is always removable.
- The old one-shot "Load my 5-star jokes for inspiration" becomes the import above.
- Preserve existing accessibility patterns (status live region, reduced motion, labels).

## Testing and gates

Lightweight TDD per `AGENTS.md`. Mock Genkit, Admin SDK and fetch; no live Firebase or paid AI
calls. Gates on the integrated result: `npm test`, `npm run lint`, `npm run typecheck`,
`npm run build`, `git diff --check`. Not verifiable here: live Gemini availability for the
owner's key, deployed hosting timeouts, real browser layout.

## Release

One commit per workstream (plus the contract commit), then push `master` (owner authorized it
as the release). No Firestore deploy needed.

## Addendum: rebased onto origin/master (supersedes conflicting text above)

After the first draft, `origin/master` turned out to hold 8 newer commits (2026-10-30) that the
local checkout lacked. They already ship: hinge-first dad-joke one-liner prompt (≤ 20 words, hinge
named before the joke, landed last), automatic joke checks (`joke-lint.ts`, −2 per issue), critic
calibrated to the user's ratings, "Proven classics" mode (`mode: 'original' | 'classic'`), library
near-duplicate filter (`isNearDuplicateJoke`), avoid examples (recent thumbs-down + 1–2 star jokes),
and thumbs up/down on generated cards via `POST /api/generated-joke-feedback` into the top-level
`generatedJokeFeedback` collection (doc id `${uid}_${sha256(normalizeJokeKey)[0:32]}`, fields
`userId, jokeText, category, vote ('up'|'down'|'none'), mode?, model?, topicHint?, requestId?,
updatedAt`). Decisions (my calls):

1. **Build on, don't replace.** Keep the hinge-first direction, lint, critic calibration, classic
   mode, library filter and avoid examples. Workstream A's prompt work becomes additive: count,
   taste section, tolerant parsing, reliability. **The `style` option is dropped** (it would fight
   the owner's deliberate hinge-first one-liner direction); `JOKE_STYLES` is not in the contract.
2. **One feedback store.** B stores feedback in the existing `generatedJokeFeedback` collection
   with the existing doc id scheme and fields, adding `reason?`, `saved` (bool) and `createdAt`.
   A cleared vote is stored/merged as no vote; a record with no vote and `saved === false` is
   deleted (the downvote reader only reads `vote == 'down'`, so deletion is compatible). Per-user
   listing uses an equality-only `where('userId', '==', uid)` capped at 500 docs and sorts in
   memory (no composite index, no deploy). `GenerationFeedback.id` is the 32-hex text hash.
3. **One feedback route.** Extend the existing `/api/generated-joke-feedback`: `POST` keeps its
   current contract (vote `'up'|'down'|'none'`, category, mode, model, topicHint, requestId; API
   token callers still allowed) and additionally accepts `reason`, `saved`, `vote: null` and an
   omitted vote/category, returning `{ ok: true, feedback }`; new `GET` (list + counts) and
   `DELETE` (clear all) are id-token only. The planned `/api/generation-feedback` route is not
   created. Contract: `FEEDBACK_API_PATH`, `FeedbackUpsertSchema` (accepts `'none'`, normalizes to
   null; accepts `mode`, `requestId`), `FeedbackUpsertInput` for clients.
4. **Taste vs. avoid examples.** `loadTasteProfile(uid)` stays per user. In the flow, disliked
   taste items (with reasons) are rendered in the taste section; texts already present there are
   removed from `avoidJokes` to avoid repeating them. Liked and samples are craft targets and copy
   references.
5. **UI.** C keeps the "New jokes / Proven classics" mode control and the existing thumbs
   accessible names, moving vote calls to `tasteService.setFeedback` (same route), adding reasons,
   saves, edit, batches, samples and the feedback list. No style select.
6. **Release scope.** Pushing `master` also releases nothing extra: `origin/master` already
   contains the 8 commits; local work is rebased on top of it.
