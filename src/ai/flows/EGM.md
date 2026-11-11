# AI Flows

## Overview

These are the Genkit flows and helpers behind joke generation and joke
explanation. Generation produces `2 × count` candidates and scores them with a
critic call. It then selects up to `count` eligible, unique jokes and can
optionally run one repair round. Every generation model call goes through the
model runner, which provides a fallback chain, a time budget, a call cap, and
cool-down feedback. Explanation streams text from one fixed model. The API
routes `src/app/api/generate-joke/route.ts` and
`src/app/api/explain-joke/route.ts` consume this module.

## Interface

### `generate-joke-flow.ts`

- `generateJoke(input: GenerateJokeInput, options?: GenerateJokeOptions): Promise<GenerateJokeOutput>`: calls the internal `runGenerateJoke` directly when any trusted option is set (`allowRepair === true`, `onProgress`, `signal`, `onLog`, or `startedAt`). Otherwise it calls the registered Genkit flow `generateJokeFlow`.
- `GenerateJokeInput`: inferred from the internal `GenerateJokeInputSchema`. Fields: `topicHint`, `prefilledJokes`, `exemplarJokes`, `recentGeneratedJokes`, `avoidJokes`, `mode` (`JOKE_MODES`), `libraryJokes`, `model` (catalog id or legacy alias), `temperature` (0 to 2), `count` (`minCount` to `maxCount`), and `taste` (`samples`, `liked`, `disliked`). Size limits come from `JOKE_GENERATION_LIMITS`.
- `GenerateJokeOptions`: `{ allowRepair?, onProgress?, signal?, onLog?, startedAt? }`.
- `GenerateJokeOutput` (= `GenerationResult`): `{ jokes, model, requestedCount }`.
- `JokeVariation`: inferred from `JokeVariationSchema`.
- Registered Genkit flow name: `'generateJokeFlow'` (input `GenerateJokeInputSchema`, output `GenerationResultSchema`).

### `explain-joke-flow.ts`

- `explainJoke(input: ExplainJokeInput): Promise<ReadableStream<Uint8Array>>`: streams a UTF-8 explanation from `ai.generateStream` using `EXPLAIN_MODEL`.
- `ExplainJokeInput`: `{ jokeText: string }`.

### `model-runner.ts`

- `createModelRunner(options: ModelRunnerOptions)`: returns `{ run, callCount, model }`. `run<T>(step: RunnerStep<T>)` resolves to `{ value, model }`.
- `ModelRunnerOptions`: `{ selected, signal?, startedAt?, onCall?, onFallback?, onLog? }`. `RunnerStep<T>`: `{ step, request(model), parse(output) }`.
- `ModelRunner`, `GenerationStep` (`'generate' | 'critic'`), `RunnerLogFields`.
- Constants: `GENERATION_BUDGET_MS = 90_000`, `STEP_TIMEOUT_MS = { generate: 35_000, critic: 25_000 }`, `MIN_FALLBACK_REMAINING_MS = 10_000`, and `FALLBACK_STATUSES` (`UNAVAILABLE`, `RESOURCE_EXHAUSTED`, `INTERNAL`, `DEADLINE_EXCEEDED`, `UNKNOWN`, `NOT_FOUND`, `INVALID_ARGUMENT`).
- Error classes: `UnusableOutputError` (thrown by step parsers) and `ModelRunnerError`. `isRunnerError(error)` returns true for either.
- Re-export: `MODELS_UNAVAILABLE_ERROR`.

### `joke-selection.ts`

- `CriticRankingSchema` is the strict per-row schema. `CriticModelOutputSchema` is the loose shape requested from the model. Related types: `CriticRanking`, `CriticOutput`, `Candidate` (`JokeVariation & { hinge?, mechanism? }`), and `JokeSelection`.
- `parseCriticRankings(output, candidateCount): CriticOutput | null`.
- `selectJokes(candidates, verdict, referenceTexts, libraryTexts = [], count = 3): JokeSelection | null`.
- `compareSelections(left, right): number`.
- `repairFeedback(candidates, verdict, referenceTexts)` and `hasRepairTrigger(candidates, verdict, referenceTexts): boolean`.
- `LINT_PENALTY = 2`. Re-exports `JokeVariationSchema` and `JokeVariation` from `@/lib/jokeGenerationContract`.

### `joke-lint.ts`

- `lintJoke(text, hinge?): JokeLintIssue[]`. Issues are `'too-long' | 'exclamation' | 'marked-pun' | 'trailing-explanation'`.
- `MAX_JOKE_WORDS = 20`.

### `generation-errors.ts`

- Message constants: `QUALITY_ERROR`, `SCARCITY_ERROR`, `NONE_ELIGIBLE_ERROR`, `EMPTY_CANDIDATES_ERROR`, `INVALID_CANDIDATES_ERROR`, `MODELS_UNAVAILABLE_ERROR`, `DISCONNECTED_ERROR`, and `CALL_LIMIT_ERROR`.
- `PUBLIC_GENERATION_ERRORS`: maps messages to the public codes `QUALITY_CHECK_FAILED`, `INSUFFICIENT_JOKES`, `EMPTY_CANDIDATES`, `INVALID_CANDIDATES`, and `MODELS_UNAVAILABLE`. `DISCONNECTED_ERROR` and `CALL_LIMIT_ERROR` have no mapping.

## Invariants

### Generation (`generate-joke-flow.ts`)

- `runGenerateJoke` always parses input with `GenerateJokeInputSchema.parse`. Unknown fields are stripped and never enable repair.
- Strict mode applies when `count` is absent. Only a selection of exactly `JOKE_GENERATION_LIMITS.defaultCount` jokes is usable; otherwise the flow throws `SCARCITY_ERROR`. With `count` set, partial batches are allowed, and the flow throws `NONE_ELIGIBLE_ERROR` when nothing is eligible.
- Default sampling temperature is `1.1`. The critic uses temperature `0.2`. The selected model is `resolveModelId(input.model) ?? DEFAULT_GENERATE_MODEL`.
- Disliked taste items are removed from `avoidJokes` before prompting, so each appears only once, in the taste section.
- The reference set passed to `selectJokes`, `hasRepairTrigger` and `repairFeedback` is `prefilledJokes`, `exemplarJokes`, `recentGeneratedJokes`, the original `avoidJokes` (before disliked items are removed), and every taste text (samples, liked, disliked).
- With `mode === 'classic'`, the critic system prompt gets `CLASSIC_CRITIC_NOTE` appended, which allows well-known jokes and sets `original` false only for repeats of reference-list jokes or tired premises.
- `parseCandidates` keeps the first `2 × count` valid candidates with unique `normalizeJokeKey` keys. It drops a `hinge` longer than 200 characters and a `mechanism` longer than 80. Fewer than `count` candidates throws `UnusableOutputError(INVALID_CANDIDATES_ERROR)`. Non-object output throws `EMPTY_CANDIDATES_ERROR`.
- The critic fails closed. An unparseable verdict raises `UnusableOutputError(QUALITY_ERROR)`. Errors that `isRunnerError` does not recognize are rethrown as `Error(QUALITY_ERROR)`.
- Repair runs only when `options.allowRepair === true` and `hasRepairTrigger` is true. The repaired selection replaces the baseline only if it is usable and `compareSelections(repaired, baseline) > 0`. With no usable baseline, any usable repaired selection is returned, so repair can turn a would-be `SCARCITY_ERROR` or `NONE_ELIGIBLE_ERROR` into a success. Any error during repair is swallowed, so a usable baseline survives.
- Returned jokes are reduced to `{ jokeText, category }` (`toVariation`). `hinge` and `mechanism` are never output.
- `onProgress` receives `{ stage, callCount, model }`. Stages: `generating`, `reviewing`, `fallback` (from the runner's `onFallback`), `selecting`, and with repair `repairing`, `reviewing-repair`, `selecting-repair` and `repair-fallback` (repair did not replace a usable baseline).
- Before returning, the flow calls `onLog('selected', { model, requestedCount, returnedCount })`.
- `onProgress` and `onLog` callback exceptions are caught and ignored.

### Model runner (`model-runner.ts`)

- The chain is `orderByHealth(modelChain(selected))`. A `'chain-reordered'` log is emitted when the first model changes.
- Before each attempt, the runner checks the abort signal, the remaining budget (counted from `startedAt` or runner creation), and the cap `callCount < MAX_GENERATION_CALLS` (from `@/lib/generationProgress`).
- The per-attempt timeout is `min(STEP_TIMEOUT_MS[step], remaining)`. Each call races against an abort promise, so a provider that ignores `abortSignal` cannot outlive the budget.
- Fallback is sticky: the chain index only advances, and later steps start on the current model.
- The runner moves to the next model after any of these failures:
  - unusable output (`UnusableOutputError`, or a Genkit `ValidationError`);
  - a timeout;
  - a network or SDK error that has no provider `status`;
  - a provider `status` in `FALLBACK_STATUSES`.
- Provider statuses outside `FALLBACK_STATUSES` are rethrown immediately.
- A step parser error that is not an `UnusableOutputError` is rethrown immediately, with no fallback and no cool-down mark.
- Every failed attempt that falls through to fallback calls `markModelFailure`, except a timeout whose per-attempt timeout was cut below `STEP_TIMEOUT_MS[step]` by the remaining budget (`blameModel`). Attempts that throw instead (a provider status outside `FALLBACK_STATUSES`, a caller abort, or a non-`UnusableOutputError` parser error) are not marked.
- The runner skips fallback when less than `MIN_FALLBACK_REMAINING_MS` remains.
- When the chain is exhausted, the runner throws one of these:
  - the last step-specific `UnusableOutputError`, if the last failure was output;
  - `ModelRunnerError(MODELS_UNAVAILABLE_ERROR)`, if any attempt failed in this `run`, or if the time budget was already used up before the next attempt (the runner records that as a timeout);
  - `ModelRunnerError(CALL_LIMIT_ERROR)`, if the call cap was reached and this `run` has no recorded failure.
- A caller abort throws `ModelRunnerError(DISCONNECTED_ERROR)`.
- Per-model config adds `thinkingConfig.thinkingLevel` when the catalog entry has `thinkingLevel`. It caps `temperature` at `maxTemperature` when the entry has one.
- Logs contain only statuses, model ids, timings, an HTTP status parsed from a `[NNN` marker, and the error class name (matching `/^[A-Za-z]{1,40}$/`, otherwise `'Error'`). They never contain provider messages or prompts.

### Selection (`joke-selection.ts`)

- `parseCriticRankings` drops invalid, out-of-range, and duplicate-index rows; the first valid row per index wins. It returns `null` when no row is valid.
- `selectJokes` eligibility requires all of these:
  - `safeForGeneralAudience`, `fitsRequest`, and `original` are all true;
  - the candidate passes `JokeVariationSchema`;
  - its normalized key matches no reference text;
  - it is not an `isNearDuplicateJoke` of any library text.
- Each score is adjusted to `score - LINT_PENALTY × lint issue count`.
- Subset size is `min(max(1, floor(count)), unique eligible jokes)`.
- The objective is `scoreSum - 2 × repeated premises - 1 × repeated mechanism`. Jokes are ordered by adjusted score, with ties broken by candidate index.
- `compareSelections` ranks by size first, then `objective`, `scoreSum`, `premiseCount`, and `mechanismCount`. Remaining ties go to the lower candidate indices.
- `hasRepairTrigger` is true when any of these holds:
  - some candidates are unranked;
  - a gate fails;
  - an adjusted score is `<= 4`;
  - a duplicate or reference-copy failure exists.

### Linting (`joke-lint.ts`)

- `lintJoke` reports issues in a fixed order, each at most once.
- Rules:
  - `too-long`: more than 20 words.
  - `exclamation`: the text contains `!` or `！`.
  - `marked-pun`: one to three words wrapped in single quotes or asterisks. Double quotes are ignored.
  - `trailing-explanation`: more than 3 words after the last occurrence of the hinge.

### Errors (`generation-errors.ts`)

- Only the messages in `PUBLIC_GENERATION_ERRORS` are meant to be shown to clients. The file comment says that any other error becomes `GENERATION_FAILED`; that mapping is implemented outside this directory.

## Side Effects

- Network calls to Google AI through the shared Genkit instance `ai` (`@/ai/ai-instance`):
  - `ai.generate` in `model-runner.ts:createModelRunner`, for generation and critic steps;
  - `ai.generateStream` in `explain-joke-flow.ts:explainJoke`.
- `generate-joke-flow.ts` calls `ai.defineFlow` at module load, which registers `generateJokeFlow` with Genkit.
- `model-runner.ts` calls `markModelFailure` and `markModelSuccess` from `@/ai/modelHealth`. Together they update in-process cool-down state that is shared across requests.
- It calls `setTimeout` per attempt and attaches abort-signal listeners, and clears both in `finally`.
- Caller-supplied callbacks `onCall`, `onFallback`, `onLog`, and `onProgress` are invoked.
- No filesystem or database access exists in this directory.

## Verification

- Focused runs:
  - `npm test -- src/ai/flows/generate-joke-flow.test.ts`
  - `npm test -- src/ai/flows/model-runner.test.ts`
  - `npm test -- src/ai/flows/joke-selection.test.ts`
  - `npm test -- src/ai/flows/joke-lint.test.ts`
- Full suite: `npm test`
