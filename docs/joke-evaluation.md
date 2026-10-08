# Frozen joke evaluation v1

Evaluation tooling only. **Bundled captures and ratings are synthetic demonstrations, not humor, safety, originality, repair efficacy, uplift or significance evidence.** No provider adapter bundled. No paid comparison was executed. Offline commands do not initialize Genkit, Firebase, dotenv or application runtime.

## Offline demonstration

Use existing locked dependencies (`npm ci` when setting up normally), Node and existing `tsx`. No package scripts added. Run from repository root; output parent must exist. Keep artifacts outside tracked repository files. Every output is exclusive: existing output directory/file causes failure; choose fresh path rather than overwrite.

```sh
ARTIFACTS="$(mktemp -d /tmp/joke-evaluation.XXXXXX)"
node --import tsx scripts/joke-evaluation/cli.ts prepare \
  --requests scripts/joke-evaluation/fixtures/requests.v1.json \
  --old scripts/joke-evaluation/fixtures/synthetic-old.v1.json \
  --new scripts/joke-evaluation/fixtures/synthetic-new.v1.json \
  --seed demo-v1 --out "$ARTIFACTS/packet"
node --import tsx scripts/joke-evaluation/cli.ts summarize \
  --blind "$ARTIFACTS/packet/blind.json" \
  --key "$ARTIFACTS/packet/key.json" \
  --ratings scripts/joke-evaluation/fixtures/synthetic-ratings.v1.json \
  --old scripts/joke-evaluation/fixtures/synthetic-old.v1.json \
  --new scripts/joke-evaluation/fixtures/synthetic-new.v1.json \
  --out "$ARTIFACTS/summary.json"
```

Synthetic ratings match seed `demo-v1` and exact bundled captures. Other seed/capture changes require new ratings; packet IDs prevent reuse. Fixture cases cover no topic, narrow topic, context overlap, explicit Italian/Spanish, requested knock-knock format and regeneration. Fixed regeneration avoidance uses existing `prefilledJokes`, not new history field: both variants receive identical supported inputs. Dynamic per-variant history is outside this study. Failure fixtures preserve old-only/new-only/both failures; missing case, ties and unrateable rows remain distinct.

## Freezing real comparisons and human ratings

1. Freeze requests and old/new captures, preserving every planned case including failures. Use full source revision for live captures, not branch name; metadata is a provenance declaration, not proof adapter executed that tree.
2. `prepare` validates strict v1 schemas, case coverage, canonical SHA-256 fixture/input hashes, distinct variants, same effective supported model and temperature. Input omission resolves to capture settings; unknown fields rejected. Frozen v1 catalog/caps mirror approved request contract structurally without production imports: topic500, text2000, prefilled25, exemplar10, recent12; finite temperature0–2. Catalog changes need explicit version review.
3. Preserve `key.json` separately from raters. Tool creates directories mode0700 and files0600; operational access controls still required. Share **only** `blind.json` plus rubric instructions. Packet contains request/dimensions, three-joke slots or neutral unavailable slots; no commits, variant IDs, capture hashes, seed, telemetry or error traces.
4. Collect `ratings.json` with `schemaVersion:1`, packet ID, `ratingKind:"human"`, `rows`. Each row: known `caseId`, pseudonymous nonempty `raterId`, `preference:"A"|"B"|"tie"|"unrateable"`, optional A/B rubric objects, optional reason≤2000. Case/rater pairs unique. Rubric integer1–5: `requestFit`, `clarity`, `earnedSurprise`, `naturalWording`, `originality`, `diversity`. Optional `safeForGeneralAudience`: true/false/null. Missing score remains unknown, not zero. No scores for unavailable slot; any failure-containing case must be unrateable, never preferred available side or tie. Example row:

```json
{"caseId":"narrow-topic","raterId":"rater-01","preference":"tie","A":{"requestFit":4,"clarity":4,"safeForGeneralAudience":null},"B":{"requestFit":4,"clarity":3,"safeForGeneralAudience":true},"reason":"Both satisfy topic; B setup less clear."}
```

5. `summarize` checks packet ID, private mapping coverage/status, blind-content hash, ratings and exact frozen capture hashes. SHA-256 detects accidental substitution, not authenticity against attacker editing packet and key together. Content can disclose origin; perfect blinding not guaranteed.

### Determinism and interpretation

Canonical JSON sorts object keys recursively and retains array order. SHA-256 hashes requests, effective inputs and captures. Algorithm `sha256-blind-v1`: case order by hash of `[algorithmVersion, seed, fixtureHash, oldCaptureHash, newCaptureHash, caseId, "order"]`; tie by caseId. Separate `"labels"` hash's first-byte low bit chooses old=A when even. Packet ID hashes first five tuple elements. Same inputs/seed produce identical bytes without timestamps or `Math.random`; seed changes order/labels only, never model reproducibility.

Reliability denominator includes all planned cases: both success, old-only failure, new-only failure, both failure. Quality preference counts include comparable cases only; old wins/new wins/ties/unrateable/missing reported separately. Raw case-rater counts and per-case records accompany equal-weight case mean: old−1/tie0/new+1; average raters within case, then average rated comparable cases. Unrateable excluded with explicit denominators. Rubric deltas require matched A/B numeric scores, also equal case weighting; per-rubric matched-pair and case coverage retained. Safety flags separate, never compensated by humor arithmetic. Missing human ratings, synthetic captures or synthetic ratings give quality status `not-evaluated`; illustrative aggregates still exist but remain prominently synthetic.

Telemetry retains null unknowns and measured zero. Known totals carry measured/unknown coverage including failed samples; partial totals never imply full-run usage. Paired new−old deltas require both measured, with unknown-pair counts. `totalTokens` separate from input/output totals, never added again. Token/latency measurements require declared sources. Monetary cost always null: no price guesses. Offline preparation time is not generation latency. Optional core `summarize` API can omit both captures, returning telemetry null; CLI requires both for complete coverage.

## Trusted adapter harness — not authorized for this mission

`capture-live` requires literal `--allow-live`, positive integer `--max-model-calls`, explicit positive `--max-cases`, trusted adapter path, pinned old/new40-hex revisions, declared2/4 call ceilings, requests and exclusive output directory. All complete worst-case allocation validated **before dynamic adapter import**. No adapter exists here for paid models. Do not run command below without separate authorization and audited adapter.

```sh
# Template ONLY. Not executed; placeholders need separately audited adapter/revisions.
node --import tsx scripts/joke-evaluation/cli.ts capture-live \
  --allow-live --max-model-calls 48 --max-cases 8 \
  --adapter /absolute/path/to/audited-adapter.ts \
  --old-revision <FULL_40_HEX_OLD> --new-revision <FULL_40_HEX_NEW> \
  --old-max-calls 2 --new-max-calls 4 \
  --requests scripts/joke-evaluation/fixtures/requests.v1.json \
  --out /managed/fresh/capture-directory
```

Adapter default export implements `Adapter` in `live.ts`: version, mock/live kind, token/latency source declarations, plan matching both revisions/ceilings, `invokeModel(request)` transport, and `run({variant, revision, input, invokeModel})` returning validated three-joke output plus optional telemetry. Every generator/critic/repair uses supplied capability. Variants receive cloned identical effective inputs; execution sequential. Default ceiling2 and repair ceiling4 per variant per case; full next-case allocation reserved before starting. Attempt charged before transport execution including rejection. Exhaustion blocks further transport and marks whole sample failure even if adapter catches rejection. Capability closes after run, pending invocations settled; rejected invocations cause failure. No retries. Errors use sanitized fixed codes, not raw traces. Tokens/latency unknown unless adapter reports instrumented measurements; invocation count measured by harness. Invalid output remains whole failure, never missing sample or fewer-joke success.

**Security boundary:** imported arbitrary code can bypass capability or act at import. Harness is not sandbox and cannot guarantee provider retries, tokens, cost, timeouts or latency. Audit adapter imports/provenance/transport, ensure all application calls use capability, disable SDK retries if provider bound required, and add instrumentation before any future paid use. Revision metadata alone cannot verify code provenance. No live Firebase, paid model, human-rating or browser evidence supplied.

## Checks

```sh
npm test -- scripts/joke-evaluation
./node_modules/.bin/eslint scripts/joke-evaluation
npm run typecheck
git diff --check
```

Tests use synthetic data and mock adapter transports only, including offline subprocess import tripwire, budget pre-import gates, rejected-call accounting, deterministic labels/integrity, equal case weighting, safety separation, whole failure retention and telemetry coverage. Integrated full test/lint/typecheck/build plus independent review remain parent-owned gates.
