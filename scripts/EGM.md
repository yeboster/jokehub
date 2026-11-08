# Scripts

## Overview

Operational tooling run outside the Next.js application. This directory holds the Firestore
rules and index deployer (a shared library plus its CLI wrapper) and the offline joke
evaluation toolkit in a subdirectory. Script tests are picked up by Vitest via the
`scripts/**/*.test.ts` include in [vitest.config.mts](/vitest.config.mts).

`deploy-firestore.ts` changes remote Firestore infrastructure. Per
[AGENTS.md](/AGENTS.md), do not run `npm run firestore:push` (or the migrations that call
`deployFirestore`) without explicit authorization; it is not a verification command.

## Interface

- `firestore-deploy.ts` (shared library):
  - `interface Credentials { projectId; clientEmail; privateKey }`
  - `credentialsFromServiceAccount(sa)`: maps snake_case service-account JSON
    (`project_id`, `client_email`, `private_key`) to `Credentials`.
  - `interface DeployResult { rulesChanged: boolean; indexesCreated: number }`
  - `deployFirestore(creds, opts?: { checkOnly?: boolean }): Promise<DeployResult>`
  - Imported by `migrations/003-deploy-firestore-rules-and-indexes.ts` and
    `migrations/004-deploy-firestore-rating-indexes.ts`.
- `deploy-firestore.ts` (CLI, `npm run firestore:push` -> `tsx ./scripts/deploy-firestore.ts`):
  - `--check` flag: passes `checkOnly: true` (read-only drift report).
  - Credential resolution (`readCredentials`): first `FIREBASE_PROJECT_ID`,
    `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (loaded via `dotenv/config`, `\n` escapes
    in the key unescaped), otherwise `firebase-admin-credentials.json` in the working
    directory; throws if neither is present.
- Subdirectories:
  - [joke-evaluation](./joke-evaluation/EGM.md): blind A/B evaluation CLI (`prepare`,
    `summarize`, `capture-live`) with zod schemas, deterministic hashing, and a budgeted
    trusted-adapter live capture.

## Invariants

- Local files are the source of truth: `firestore.rules` and `firestore.indexes.json` are read
  relative to `process.cwd()`, so the scripts must run from the repository root
  (`firestore-deploy.ts:RULES_PATH`, `INDEXES_PATH`). Only the `(default)` database is targeted
  (`firestore-deploy.ts:DATABASE`).
- Rules are compared after `trim()`; in-sync rules are not redeployed. After a deploy the release
  is re-fetched and must equal the local file, else `Post-deploy verification failed` is thrown
  (`firestore-deploy.ts:deployFirestore`).
- Indexes are only created, never deleted or modified. A local index counts as present when
  `collectionGroup|fieldPath:order-or-arrayConfig|...` matches a deployed index
  (`firestore-deploy.ts:fieldSignature`, `listDeployedIndexes`). The deployed list is read with
  `pageSize=500` in a single request.
- With `checkOnly: true` no rules or indexes are written and `DeployResult` stays
  `{ rulesChanged: false, indexesCreated: 0 }` (`firestore-deploy.ts:deployFirestore`).
- Any non-200 Google API response throws `<step> failed (HTTP <status>): <body>`
  (`firestore-deploy.ts:fail`).

## Side Effects

- Network (`firestore-deploy.ts:authedFetch`, bearer token from `google-auth-library`
  `GoogleAuth` with scope `https://www.googleapis.com/auth/cloud-platform`):
  - `GET firebaserules.googleapis.com/v1/projects/{id}/releases/cloud.firestore` and the
    referenced ruleset.
  - When rules differ and not `checkOnly`: `POST .../rulesets`, then `PATCH
    .../releases/cloud.firestore?updateMask=rulesetName`.
  - `GET firestore.googleapis.com/v1/projects/{id}/databases/(default)/collectionGroups/-/indexes`.
  - When not `checkOnly`: `POST .../collectionGroups/{collectionGroup}/indexes` for each missing
    index (builds run asynchronously on the server).
- Disk reads: `firestore.rules`, `firestore.indexes.json`; `deploy-firestore.ts` also reads
  environment / `.env` and optionally `firebase-admin-credentials.json`.
- Console output: project ID and client email, rules/index status lines. On error
  `deploy-firestore.ts` prints the message to stderr and calls `process.exit(1)`.
- See [joke-evaluation](./joke-evaluation/EGM.md) for the evaluation toolkit's exclusive file
  writes and adapter imports.

## Verification

- Run: `npm test -- scripts` (all script suites)
- Focused: `npm test -- scripts/firestore-deploy.test.ts` (mocks `google-auth-library` and
  stubs global `fetch`; no live Firebase calls)
- Focused: `npm test -- scripts/deploy-firestore.test.ts` (CLI wrapper; mocks `dotenv/config`,
  `fs` and `./firestore-deploy`)
