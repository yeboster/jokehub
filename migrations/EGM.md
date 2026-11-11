# migrations

## Overview

A sequential Firestore migration runner and the migration modules it runs.
`npm run migrations` (`tsx ./migrations` in `package.json`) runs `index.ts`.
It finds numbered migration files and runs each one that is not yet recorded
in the `migrations` Firestore collection. It uses `firebase-admin` with the
service-account file `./firebase-admin-credentials.json`. Two migrations
change Firestore data (`001`, `002`). The other two (`003`, `004`) push the
repository's Firestore rules and indexes through the shared deploy library in
`scripts/firestore-deploy.ts`.

Do not run this tooling as part of verification. `AGENTS.md` requires
explicit authorization before migrations run, because they change remote
infrastructure.

## Interface

- `index.ts` (runner entry point, no exports):
  - `main()`: reads the directory, keeps file names that match `/^\d+.*\.ts$/`,
    sorts them, and imports and runs each one that has not been applied.
  - `getAppliedMigrations(): Promise<Set<string>>`: returns the document IDs
    in the `migrations` collection.
  - `applyMigration(name, fn)`: awaits `fn(db)`, then writes
    `migrations/{name}` with `{ appliedAt: new Date() }`.
  - `MIGRATIONS_COLLECTION = 'migrations'`.
- Migration module contract: each numbered file has a default export
  `async (db: Firestore) => Promise<void>`. The runner calls it as
  `migration.default`. The migration name is the file name without `.ts`.
- `001-owner-ratings-to-joke-ratings.ts`: `default migrateOwnerRatings(db)`.
- `002-add-keywords-to-jokes.ts`: `default migrateKeywords(db)`, plus a
  module-private helper `generateKeywords(text)`.
- `003-deploy-firestore-rules-and-indexes.ts`:
  `default deployRulesAndIndexes(_db)`.
- `004-deploy-firestore-rating-indexes.ts`:
  `default deployRulesAndIndexesAgain(_db)`.
- External dependencies: `credentialsFromServiceAccount` and `deployFirestore`
  from
  [`scripts/firestore-deploy.ts`](../scripts/firestore-deploy.ts),
  and the `Joke` type from `@/lib/types` (used by `001`).

## Invariants

- Migrations run in lexicographic file-name order (`.sort()` in `main`). Only
  files matching `/^\d+.*\.ts$/` are picked up, so `index.ts` is never run as
  a migration.
- An applied migration is never re-run. `main` skips any name already in the
  `migrations` collection. To change behavior after a migration is applied,
  add a new numbered file. The doc comments in `003` and `004` state this,
  and `004` exists because `003` was already applied.
- A migration is marked as applied only after its default export resolves
  (`applyMigration` awaits `fn(db)` before the `set`). If a migration throws,
  `main().catch` logs the error and calls `process.exit(1)`. That migration
  is not recorded, and no later migrations run.
- `index.ts` initializes the Firebase Admin app only if `getApps()` is empty.
  `003` and `004` read `./firebase-admin-credentials.json` again by relative
  path. Both paths are relative to the process working directory, not this
  directory.
- `001`: only handles jokes with `funnyRate > 0`. It adds a `jokeRatings` doc
  for (`jokeId`, `userId` = joke owner) only if none exists, created with
  `add()`, so its id is auto-generated, not the `{jokeId}_{userId}` id the app
  uses elsewhere. It then sets the
  joke's `averageRating` to
  `Math.floor(sum of stars / number of ratings)` and `ratingCount` to the
  number of ratings.
- `002`: only updates jokes that have `text` and no `keywords`. Keywords are
  the lowercased words of the joke text, split on whitespace, with the
  characters `.,!?;:()"'\`` removed. Only words longer than 2 characters are
  kept, and duplicates are removed. The source comment says this helper was
  "copied from jokeService".
- `002` uses one `WriteBatch` for the whole run. It calls `batch.commit()`
  when `operations === 499`, and again at the end if `operations > 0`. The
  source comment (lines 45-48) says no new batch is created after the
  499-operation commit.
- `003` and `004` do not use the `db` argument. Their doc comments say they
  are idempotent: rules are pushed only when they differ from the deployed
  ruleset, and existing indexes are skipped. That behavior is implemented in
  `scripts/firestore-deploy.ts`, not in this directory.

## Side Effects

- Disk: reads `./firebase-admin-credentials.json` (in `index.ts`, `003`, and
  `004`), loads `.env` through `dotenv/config` (in `index.ts`), and lists this
  directory with `fs.readdirSync`.
- Firestore reads: the `migrations` collection; `jokes` (in `001` and `002`);
  `jokeRatings` queries by `jokeId` and `userId` (in `001`).
- Firestore writes: `migrations/{name}` with `appliedAt` after each
  migration; new `jokeRatings` docs (`jokeId`, `userId`, `stars`,
  `comment: null`, `createdAt`, `updatedAt`) and `jokes` updates to
  `averageRating` and `ratingCount` (in `001`); `jokes` batch updates to
  `keywords` (in `002`).
- Remote infrastructure: `003` and `004` call `deployFirestore(...)`. Their
  doc comments say this deploys `firestore.rules` and `firestore.indexes.json`
  to production.
- Process: logs to the console; calls `process.exit(1)` on failure.
- Dynamic `import()` of each pending migration file.

## Verification

- Run: `npm test`. No test files exist in this directory, so the suite does
  not exercise these modules.
- Focused: `npm test -- <path>`. No focused test target exists for this
  directory.
- Do not use `npm run migrations` for verification. It writes to live
  Firestore and deploys rules and indexes, and `AGENTS.md` requires explicit
  authorization before it runs.
