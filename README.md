# Firebase Studio

This is a NextJS starter in Firebase Studio.

To get started, take a look at src/app/page.tsx.

## Environment variables

- `JOKEHUB_JARVIS_USER_ID` — Firebase UID that jokes added via `POST /api/jokes/add` are attributed to. Required; the endpoint returns a 500 if unset.
- `JOKEHUB_ENABLE_JOKE_REPAIR` — optional, server-only repair opt-in. Only literal `true` enables one repair attempt; unset/other values disable it. Client fields cannot authorize repair.

## Joke generation

Generation asks for twice the requested number of candidates (six for the default of three), then returns the best assessed jokes/categories. The prompt targets dad-joke one-liners of at most 20 words built around a double-meaning hinge that the model names before writing the joke and lands last. Critic-reported general-audience safety, request fit and originality are mandatory eligibility gates. Selection uses explicit candidate indices, normalized-text uniqueness and a quality score with premise/mechanism redundancy penalties; each automatic check failure (over 20 words, exclamation mark, pun marked with single quotes or asterisks, more than three words after the hinge) costs two points. Candidates whose content words overlap a saved library joke by 60% or more are dropped; diversity is best effort, not semantic duplicate detection.

`mode: "classic"` ("Proven classics" on the add-joke page) asks for real, lesser-known existing jokes instead of new ones, lists the library so the model skips it, and lets the critic accept well-known jokes.

**Count and partial batches:** the optional request field `count` (integer 1–5) sets how many jokes to return. When `count` is sent, a batch may be partial: if fewer jokes pass the gates, the response holds between 1 and `count` jokes, and none passing returns `No joke passed the quality check. Please try again.` (`INSUFFICIENT_JOKES`). When `count` is not sent, the old contract holds: exactly three jokes or `Could not produce three eligible, unique jokes. Please try again.` (`INSUFFICIENT_JOKES`). Candidate output is parsed tolerantly: invalid items are skipped, the first `2 × count` unique candidates are kept, and fewer than `count` unique candidates counts as unusable output. Critic rows with invalid, duplicate or out-of-range indices are dropped (first valid row per index wins); unranked candidates are ineligible. No critic row valid on any model fails closed with `Joke quality check failed. Please try again.` No unassessed fallback or duplicate padding. A usable assessed baseline survives repair failure.

The result (JSON body, or `result.output` when streaming) is `{ jokes, model, requestedCount }`: `model` is the model that produced the returned jokes, `requestedCount` the requested (or default) count.

**Taste profile:** for signed-in browser callers (Firebase ID token) the route loads the user's taste profile (`loadTasteProfile`: active samples, liked and disliked generated jokes with optional reasons) at the same time as the server examples. Send `useTasteProfile: false` to skip it. API-token callers never get one. A failed load never fails the request; it continues without taste. The generator prompt lists samples and liked jokes as craft targets ("match the craft, not the material") and disliked jokes with their reasons as patterns to avoid; avoid examples with the same text as a disliked joke are listed only once, in the taste section. The critic treats taste as the strongest quality signal after the mandatory gates, in both modes. All taste texts are copy references, so a candidate repeating one is excluded. Like all user-supplied context, taste is framed as reference data, not instructions.

Request limits: topic hint500 JavaScript string-length units; each context/output text2000; prefilled jokes25; exemplars25; recent generated jokes12; count 1–5. Server-only: avoid examples8; library1000; taste samples, liked and disliked10 each, reasons200. Invalid/oversized client input returns400 rather than truncating intent. Text keys normalize Unicode NFKC, lowercase, remove punctuation and collapse whitespace.

### Models and fallback

`model` accepts the catalog ids in `src/ai/models.ts` and the legacy aliases listed there (for example `googleai/gemini-2.5-flash` → `googleai/gemini-3.5-flash-lite`); anything else returns400. The default is Gemini 3.5 Flash-Lite. Every application model call goes through `src/ai/flows/model-runner.ts`, which walks `modelChain(selected)` (the selected model, then up to two backups):

- It switches to the next model on a Genkit error with status `UNAVAILABLE`, `RESOURCE_EXHAUSTED`, `INTERNAL`, `DEADLINE_EXCEEDED`, `UNKNOWN`, `NOT_FOUND` or `INVALID_ARGUMENT`, on an error without a provider status (for example a network failure; logged as `reason: network` with only the error class name), on an attempt timeout, and on unusable structured output. Errors with any other provider status (for example `PERMISSION_DENIED`, which fails the same way on every model) are not retried. A client disconnect is never retried.
- The chain is sticky: after a switch, later calls in the same request start from the model that worked.
- Time budget: 90 s per request, counted from the request start. Each candidate attempt may take 35 s and each critic attempt 25 s, capped by what is left. No switch is attempted with less than 10 s left. The route exports `maxDuration = 120`.
- At most 10 application calls per request (`MAX_GENERATION_CALLS`).
- Cool-down (`src/ai/modelHealth.ts`): a model that fails with one of the errors above is moved to the end of the chain for 5 minutes on that server instance; a success clears it. It is kept in memory only.
- When every model in the chain fails with provider, network or timeout errors, the error is `All models are busy right now. Please try again in a minute.` (`MODELS_UNAVAILABLE`).
- `thinkingConfig.thinkingLevel` is sent only for catalog models that define one.

Server references require finite average rating4–5 and integer rating count≥1 (the app is effectively single-rater), selected across category buckets from at most two200-document reads, website-sourced jokes first, then rating, then a random draw that changes with each 60s cache window. Sparse pools stay sparse: no unrated padding or blanket five-star fallback claim. Avoid examples are up to four recent thumbs-down generated jokes followed by jokes rated 1–2 stars, six in total; the critic sees both lists as calibration.

Thumbs up/down on generated jokes are written by `POST /api/generated-joke-feedback` through the Admin SDK to `generatedJokeFeedback` (one document per user and normalized joke text). The collection has no client security rules, so browsers cannot read or write it directly. Browser regeneration sends latest12 normalized-unique successful texts as avoidance context; memory resets on session change/sign-out/auth-loading remount and is never persisted.

Default successful generation uses two application `ai.generate` invocations. Trusted repair adds at most one replacement generation and one replacement critic, with no repeated repair. Model fallbacks add calls, within the 10-call cap. These ceilings do **not** guarantee provider request counts, SDK retries, token usage, monetary cost or latency.

### Progress and troubleshooting

The add-joke page requests `Accept: application/x-ndjson` from `POST /api/generate-joke`. It shows actual server stages (examples, candidate writing, review, selection, optional repair/review/fallback, switching to a backup model), elapsed time, and a selectable request ID. Errors stay inline with **Try again**; a lost/truncated stream becomes an error, not a success. No percentage or per-token progress is inferred. Slow-request guidance appears after 30 seconds.

Clients without that Accept value still receive the existing JSON success shape. Authentication, validation and rate-limit failures remain HTTP JSON errors, even for streaming clients. Every response includes `x-request-id`. Streaming responses use newline-delimited `progress`, `heartbeat` (every five seconds while active), and exactly one terminal `result` or `error` frame for connected requests. After streaming starts, HTTP status is 200; inspect the terminal frame for success/failure. `result.output` contains the `{ jokes, model, requestedCount }` result. Progress frames carry `model` when known; a `fallback` frame names the model being switched to. Browser disconnects stop subsequent application model calls; an already-running provider call is **not** guaranteed to stop or avoid charges.

Search runtime logs for `[joke-generation]` and the request ID. Records include event, stage, elapsed/stage duration in milliseconds, current model, application call count and sanitized error codes. Model events: `attempt-failed` (logged as an error, with `model`, `step`, `reason` `provider`/`network`/`timeout`/`output`, `attemptMs`, and for provider errors `providerStatus` and `httpStatus`, the three digits from a `[NNN` marker only), `model-fallback` (`fromModel`, `toModel`), `fallback-skipped`, `chain-reordered` (a cooling model was moved back), `selected` (`requestedCount`, `returnedCount`), and `taste-loaded` (counts only) or `taste-unavailable`. They exclude tokens, prompts, joke/context/taste text, user IDs, provider messages and raw provider exceptions. Unknown generation failures return a generic retry message; known quality/scarcity errors retain their helpful text. Heartbeats indicate an open connection, not model work or quality guarantees. Hosting/proxy buffering and authenticated live generation require separate deployment verification.

### Offline evaluation

Frozen synthetic fixtures demonstrate reproducible blind comparisons, failure/tie accounting and honest unknown telemetry. They do not establish humor, safety, originality or repair efficacy. No live quality comparison or paid provider adapter is supplied. See [evaluation workflow](docs/joke-evaluation.md) for preparation, human-rating summaries and explicit trusted-adapter limitations.

```sh
ARTIFACTS="$(mktemp -d /tmp/joke-evaluation.XXXXXX)"
node --import tsx scripts/joke-evaluation/cli.ts prepare \
  --requests scripts/joke-evaluation/fixtures/requests.v1.json \
  --old scripts/joke-evaluation/fixtures/synthetic-old.v1.json \
  --new scripts/joke-evaluation/fixtures/synthetic-new.v1.json \
  --seed demo-v1 --out "$ARTIFACTS/packet"
```

## Deploying Firestore rules + indexes

The local `firestore.rules` and `firestore.indexes.json` are the source of truth. Two ways to push them:

- `npm run migrations` — migration `003-deploy-firestore-rules-and-indexes` deploys both, using the same `firebase-admin-credentials.json` as every other migration. Runs once; for a later rules change, add a new `004-...ts` migration.
- `npm run firestore:push` — ad-hoc deploy (or `npm run firestore:push -- --check` for a read-only diff of local vs deployed). Credentials come from `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` (env or `.env`, same shape as `src/lib/admin.ts`) or fall back to `firebase-admin-credentials.json`.

Both are idempotent: in-sync rules are left untouched (and any push is verified by re-fetching the deployed ruleset), existing indexes are skipped. Index builds are async — dependent queries start working once each index leaves the BUILDING state in the Firebase console.
