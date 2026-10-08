# Firebase Studio

This is a NextJS starter in Firebase Studio.

To get started, take a look at src/app/page.tsx.

## Environment variables

- `JOKEHUB_JARVIS_USER_ID` — Firebase UID that jokes added via `POST /api/jokes/add` are attributed to. Required; the endpoint returns a 500 if unset.
- `JOKEHUB_ENABLE_JOKE_REPAIR` — optional, server-only repair opt-in. Only literal `true` enables one repair attempt; unset/other values disable it. Client fields cannot authorize repair.

## Joke generation

Generation produces six candidates, then returns exactly three assessed jokes/categories. Critic-reported general-audience safety, request fit and originality are mandatory eligibility gates. Selection uses explicit candidate indices, normalized-text uniqueness and a quality score with premise/mechanism redundancy penalties; diversity is best effort, not semantic duplicate detection.

**Availability change:** invalid/failed initial critique now fails closed with `Joke quality check failed. Please try again.` Insufficient eligible unique results return `Could not produce three eligible, unique jokes. Please try again.` No unassessed fallback or duplicate padding. A usable assessed baseline survives repair failure.

Request limits: topic hint500 JavaScript string-length units; each context/output text2000; prefilled jokes25; exemplars10; recent generated jokes12. Invalid/oversized client input returns400 rather than truncating intent. Text keys normalize Unicode NFKC, lowercase, remove punctuation and collapse whitespace. Success still contains exactly three nonempty joke/category objects.

Server references require finite average rating4–5 and integer rating count≥3, selected across category buckets from at most two50-document reads. Sparse pools stay sparse: no unrated padding or blanket five-star fallback claim. Browser regeneration sends latest12 normalized-unique successful texts as avoidance context; memory resets on session change/sign-out/auth-loading remount and is never persisted.

Default successful generation uses two application `ai.generate` invocations. Trusted repair allows at most four (generation, critic, one replacement generation, one replacement critic), with no repeated repair. These ceilings do **not** guarantee provider request counts, SDK retries, token usage, monetary cost or latency.

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
