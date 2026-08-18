# Firebase Studio

This is a NextJS starter in Firebase Studio.

To get started, take a look at src/app/page.tsx.

## Environment variables

- `JOKEHUB_JARVIS_USER_ID` — Firebase UID that jokes added via `POST /api/jokes/add` are attributed to. Required; the endpoint returns a 500 if unset.

## Deploying Firestore rules + indexes

The local `firestore.rules` and `firestore.indexes.json` are the source of truth. Two ways to push them:

- `npm run migrations` — migration `003-deploy-firestore-rules-and-indexes` deploys both, using the same `firebase-admin-credentials.json` as every other migration. Runs once; for a later rules change, add a new `004-...ts` migration.
- `npm run firestore:push` — ad-hoc deploy (or `npm run firestore:push -- --check` for a read-only diff of local vs deployed). Credentials come from `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` (env or `.env`, same shape as `src/lib/admin.ts`) or fall back to `firebase-admin-credentials.json`.

Both are idempotent: in-sync rules are left untouched (and any push is verified by re-fetching the deployed ruleset), existing indexes are skipped. Index builds are async — dependent queries start working once each index leaves the BUILDING state in the Firebase console.
