# Joke Evaluation

## Overview

Offline tooling for blind A/B evaluation of two joke-generation variants ("old" and "new"). It
validates captured generation outputs against a request fixture, builds a blind packet with a
private label key, summarizes ratings against that key, and can optionally capture outputs live
through a trusted adapter module. Usage is documented in
[docs/joke-evaluation.md](/docs/joke-evaluation.md). No package script is defined; the CLI is
invoked as `node --import tsx scripts/joke-evaluation/cli.ts <command>` from the repository root.

Sample JSON inputs (`requests.v1.json`, `synthetic-old.v1.json`, `synthetic-new.v1.json`,
`synthetic-ratings.v1.json`) live in `./fixtures/` (data only, no contract file).

## Interface

- `types.ts` (zod schemas and constants; local catalog, never imports application runtime):
  - Constants: `MODELS`, `DEFAULT_MODEL` (`googleai/gemini-3.6-flash`), `DEFAULT_TEMPERATURE`
    (`1.1`), `ALGORITHM_VERSION` (`sha256-blind-v1`), `RUBRICS` (`requestFit`, `clarity`,
    `earnedSurprise`, `naturalWording`, `originality`, `diversity`), `UNKNOWN_TELEMETRY`.
  - Schemas: `inputSchema`, `requestsSchema`, `outputSchema`, `telemetrySchema`, `recordSchema`,
    `captureSchema`, `blindSchema`, `keySchema`, `ratingsSchema`.
  - Types: `Requests`, `Input`, `Output`, `Capture`, `CaptureRecord`, `Telemetry`, `Blind`,
    `PrivateKey`, `Ratings`.
- `core.ts` (pure functions):
  - `canonical(value)`: deterministic JSON with sorted object keys.
  - `digest(value)`: SHA-256 hex of `canonical(value)`.
  - `effectiveInput(input, model?, temperature?)`: fills `model`/`temperature` defaults.
  - `validateCapture(requests, raw)`: parses and cross-checks a capture against requests.
  - `prepare(rawRequests, rawOld, rawNew, seed)`: returns `{ blind, key }`.
  - `summarize(rawBlind, rawKey, rawRatings, rawOld?, rawNew?)`: returns the summary object
    (`reliability`, `quality`, `telemetry`, `provenance`, `synthetic`).
- `cli.ts`:
  - `main(argv)`: commands `prepare` (`--requests --old --new --seed --out`), `summarize`
    (`--blind --key --ratings --old --new --out`), `capture-live` (`--allow-live
    --max-model-calls --max-cases --adapter --old-revision --new-revision --old-max-calls
    --new-max-calls --requests --out`). Runs `main` when executed directly.
- `live.ts`:
  - `captureLive(rawRequests, rawOptions, loadAdapter?)`: returns `{ old, new }` captures.
  - Types: `VariantPlan`, `LiveOptions`, `Adapter`.

## Invariants

- Request fixtures: `caseId` values are unique and `regenerationOf` must reference an earlier
  case (`types.ts:requestsSchema`). Every generation output contains exactly 3 jokes
  (`types.ts:outputSchema`).
- A `live` capture requires a 40-hex `sourceCommit`; measured tokens or latency require the
  matching `telemetryDefinition` source (`types.ts:captureSchema`).
- `validateCapture` requires `fixtureHash === digest(requests)`, one record per case, no
  duplicate records, matching effective model/temperature, and `inputHash ===
  digest(effectiveInput(...))` (`core.ts:validateCapture`).
- `prepare` requires a seed of 1-200 characters, distinct `variantId`s, and identical model and
  temperature for both captures. Case order and A/B labels are derived deterministically from
  `digest` over `[ALGORITHM_VERSION, seed, fixtureHash, oldHash, newHash]`; `packetId` is the
  digest of that tuple (`core.ts:prepare`, `core.ts:oldHasLabelA`).
- `summarize` re-verifies packet integrity (`blindHash`, `packetId`, deterministic label mapping,
  slot statuses), requires both captures or neither, rejects duplicate case/rater pairs, requires
  `unrateable` for cases with a failed slot, and forbids scoring unavailable slots
  (`core.ts:validatePacket`, `core.ts:validateFrozenCaptures`, `core.ts:summarize`).
- `quality.status` is `human-ratings` only when `ratingKind` is `human`, rows exist, and neither
  capture is `synthetic`; otherwise `not-evaluated` (`core.ts:summarize`).
- CLI `summarize` requires both `--old` and `--new`; `capture-live` requires the literal
  `--allow-live`, 40-hex revisions, per-variant ceilings of 2 or 4 calls, and
  `cases * (oldMax + newMax) <= --max-model-calls` (`cli.ts:main`).
- `captureLive` charges each attempted model call before execution (including rejected calls),
  enforces per-variant and total budgets, requires the adapter's declared `plan` to equal the
  options, and records failures as `MODEL_BUDGET_EXHAUSTED`, `ADAPTER_FAILURE`, or
  `INVALID_ADAPTER_RESULT` (`live.ts:captureLive`).
- The adapter import is a trust boundary, not a sandbox: only trusted audited code may be passed
  as `--adapter` (`live.ts:captureLive` comment).

## Side Effects

- `cli.ts:main` reads JSON input files. Outputs are exclusive: `prepare` and `capture-live`
  create a new directory (`mkdir`, mode `0o700`) and write files with flag `wx`, mode `0o600`
  (`blind.json`/`key.json` or `old.json`/`new.json`); on error the output directory is removed.
  `summarize` writes one file with flag `wx`, mode `0o600`.
- On failure when run directly, `cli.ts` prints a generic error to stderr and sets
  `process.exitCode = 1`.
- `live.ts:captureLive` dynamically imports the adapter module from `adapterPath` and calls its
  `run`/`invokeModel`. Whether those calls reach a network model is decided by the adapter, not
  by this directory.
- `types.ts` and `core.ts` have no I/O; `core.ts` uses `node:crypto` hashing only.

## Verification

- Run: `npm test -- scripts/joke-evaluation`
