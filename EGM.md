# Jokehub Blueprint

## System Overview

Jokehub is a Next.js App Router application (React, strict TypeScript,
Tailwind CSS, Radix UI) backed by Firebase and Genkit. Users browse and rate a
shared joke feed, manage their own jokes, and generate new jokes with Google AI
models in the joke studio (`/add-joke`). The hand-written
[README.md](./README.md) covers setup, environment, models and the API; the
[AGENTS.md](./AGENTS.md) file covers conventions and safety rules.

- Browser code reads and writes Firestore directly through the client SDK
  (`src/services/`), constrained by `firestore.rules`.
- API routes (`src/app/api/`) use the Admin SDK (`src/services/server/`,
  `src/lib/admin.ts`), which bypasses the rules, and call Google AI through
  Genkit (`src/ai/`).
- Operational tooling (`scripts/`, `migrations/`) deploys Firestore rules and
  indexes and migrates data.

## Local Interface & Invariants

- `package.json` scripts: `dev` (port 9002), `build`, `start`, `lint`,
  `typecheck`, `test` (`vitest run`), `test:watch`, `genkit:dev`,
  `genkit:watch` (`src/ai/dev.ts`), `migrations` (`tsx ./migrations`),
  `firestore:deploy` (`firebase deploy --only firestore`), `firestore:push`
  (`tsx ./scripts/deploy-firestore.ts`).
- `vitest.config.mts`: default environment `jsdom`; includes
  `src/**/*.test.{ts,tsx}` and `scripts/**/*.test.ts`; `@` aliases `./src`.
  Suites that need real Node request/response globals opt out with
  `// @vitest-environment node`.
- `eslint.config.mjs`: `eslint-config-next` core-web-vitals and typescript flat
  configs; ignores `.next/**`, `out/**`, `build/**`, `node_modules/**`,
  `next-env.d.ts`, `.hermes/**`, `migrations/**`, `firebase-debug.log` and
  `firebase-debug.*.log`; rules `eol-last: ['error', 'always']` and
  `react-hooks/exhaustive-deps: warn`.
- `next.config.ts`: empty `NextConfig` (no remote image hosts).
- `tailwind.config.ts`: `darkMode: ["class"]`; content globs cover
  `src/pages`, `src/components` and `src/app` only, so Tailwind class names
  built in `src/lib` are not scanned; plugin `tailwindcss-animate`.
- `postcss.config.mjs`: `tailwindcss` plugin only.
- `firebase.json`: points the Firebase CLI at `firestore.rules` and
  `firestore.indexes.json`, the local sources of truth for rules and indexes.

## Subdirectories & System Boundaries

- src: [./src/EGM.md](./src/EGM.md) - Application source: `ai`, `app`,
  `components`, `contexts`, `hooks`, `lib` and `services` packages.
- scripts: [./scripts/EGM.md](./scripts/EGM.md) - Firestore rules and
  composite-index deployer (`deployFirestore`, `npm run firestore:push`,
  `--check` for a read-only diff) and the offline joke-evaluation toolkit.
- migrations: [./migrations/EGM.md](./migrations/EGM.md) - Sequential runner
  that applies numbered migrations once each, recording them in the
  `migrations` collection; 003 and 004 deploy rules and indexes through
  `scripts/firestore-deploy.ts`.

## Global Invariants

- `firestore.rules`: `jokes`, `categories` and `jokeRatings` are publicly
  readable; creates require a signed-in user; joke deletes and rating updates
  are limited to the owner (`resource.data.userId == request.auth.uid`);
  category updates and deletes are denied.
- Joke updates (`canUpdateJoke`) have two branches: the owner may update
  content without changing `userId` or `dateAdded`, and any signed-in user may
  change only `averageRating`, `ratingCount` and `ratingSum`, within the bounds
  of `isBoundedRatingUpdate`.
- A `jokeRatings` document can be deleted by the rating's owner or by the owner
  of the rated joke (checked with a `get()` of `jokes/{jokeId}`).
- `generatedJokeFeedback` and `users/{uid}/jokeSamples` have no rule matches and
  are reachable only through the Admin SDK in API routes
  (`src/services/server/tasteStore.ts`; `src/services/server/jokeExemplars.ts`
  also reads `generatedJokeFeedback`).
- Admin credentials and server-only modules (`src/lib/admin.ts`,
  `src/ai/ai-instance.ts`, `src/services/server/`) stay out of client bundles;
  `src/ai/models.ts` is imported by client components and must stay free of
  server-only code.
- Every joke-generation call goes through the model runner
  (`src/ai/flows/model-runner.ts`): fallback chain of at most 3 models, 90 s
  budget, at most `MAX_GENERATION_CALLS` (10) calls per request. Joke
  explanations do not: `explain-joke-flow.ts` calls `ai.generateStream`
  directly.
- API routes authenticate themselves through `src/lib/auth.ts`
  (`verifyApiToken`, `verifyRequestAuth`) or `src/lib/userRouteGuard.ts`
  (`requireUser`); rate limits are per process and in memory.
  `verifyApiToken` accepts only the shared service token `JOKEHUB_API_TOKEN`
  (used by `/api/jokes/add` and `/api/jokes/top`). `verifyRequestAuth`
  accepts a Firebase ID token or that same service token; a service-token
  caller gets the user id `'api-user'`.
- Feed filters are URL-derived (`src/lib/jokeFilters.ts`,
  `src/hooks/useJokeFilters.ts`) and must round-trip.
- Running `npm run migrations`, `npm run firestore:deploy` or
  `npm run firestore:push` changes remote infrastructure and needs explicit
  authorization ([AGENTS.md](./AGENTS.md)).

## Global Side Effects

- Firestore (`jokes`, `categories`, `jokeRatings`, `generatedJokeFeedback`,
  `users/{uid}/jokeSamples`, `migrations`) through the client SDK, the Admin
  SDK and the migration runner.
- Firebase Auth (email/password) in the browser; ID-token or service-token
  verification in API routes.
- Google AI (Gemini and Gemma models) through Genkit, using
  `GEMINI_API_KEY` or `GOOGLE_API_KEY`; generation and explanation calls are
  billable on paid tiers.
- Other environment inputs: `JOKEHUB_API_TOKEN` (`src/lib/auth.ts`);
  `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`
  (`src/lib/admin.ts`, `scripts/deploy-firestore.ts`);
  `NEXT_PUBLIC_FIREBASE_*` (`src/lib/firebase.ts`); `NEXT_PUBLIC_SITE_URL`,
  `VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_URL` (`src/lib/siteUrl.ts`);
  `JOKEHUB_JARVIS_USER_ID` (`src/app/api/jokes/add/route.ts`);
  `JOKEHUB_ENABLE_JOKE_REPAIR` (`src/app/api/generate-joke/route.ts`).
- Firestore rules and index deployment through the Firebase Rules and Firestore
  Admin REST APIs (`scripts/firestore-deploy.ts`).
- Browser storage: `localStorage` (remembered studio model, and the
  next-themes `ThemeProvider` theme under its default key `theme`) and
  `sessionStorage` (studio batches, last feed URL).

## System Verification

- Run: `npm test`
- Also before handing off code changes: `npm run lint`, `npm run typecheck`,
  `npm run build`, `git diff --check`.
