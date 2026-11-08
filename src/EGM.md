# src

## Overview

Application source for the Next.js App Router app. `src/` holds no source files
directly; the `@/` import alias resolves here (`tsconfig.json`,
`vitest.config.mts`). Layers, from the UI down:

- `app/` routes and API handlers use `components/`, `contexts/` and `hooks/` on
  the client, and `ai/` plus `services/server/` on the server.
- `services/` (client SDK) and `services/server/` (Admin SDK) are the only
  Firestore access layers; `lib/` holds shared contracts and helpers used by all
  of them.

## Subdirectories & Boundaries

- ai: [./ai/EGM.md](./ai/EGM.md) - Genkit instance, model catalog (default
  `googleai/gemma-4-31b-it`, fallback chain, legacy aliases), in-process model
  cool-down, generation and explanation flows, and prompt builders. Server-only
  except `models.ts`, which client components import.
- app: [./app/EGM.md](./app/EGM.md) - Root layout and providers, pages
  (`/`, `/jokes`, `/joke/[jokeId]`, `/add-joke`, `/edit-joke/[jokeId]`,
  `/manage`, `/auth`) and API routes (`/api/generate-joke`,
  `/api/explain-joke`, `/api/generated-joke-feedback`, `/api/joke-samples`,
  `/api/jokes/add`, `/api/jokes/top`), each authenticating itself.
- components: [./components/EGM.md](./components/EGM.md) - Feature components
  (add-joke form, CSV import, feed list, star rating, navbar) and the `joke`,
  `jokes`, `joke-studio` and `ui` primitive packages; persistence goes through
  callback props or hook objects.
- contexts: [./contexts/EGM.md](./contexts/EGM.md) - `AuthProvider`/`useAuth`
  (Firebase Auth session) and `JokeProvider`/`useJokes` (feed state, categories,
  mutation helpers over the client services); `JokeProvider` must sit inside
  `AuthProvider`.
- hooks: [./hooks/EGM.md](./hooks/EGM.md) - URL-derived feed filters, user
  categories, toast store, mobile breakpoint, and Joke Studio state (generation
  stream, feedback, samples, session batches, remembered model in
  `localStorage`).
- lib: [./lib/EGM.md](./lib/EGM.md) - Firebase client/Admin bootstrapping, API
  auth, rate limiting and route guards, zod contracts for generation and taste
  data, the NDJSON stream reader, filter URL round-tripping, and pure UI copy
  helpers.
- services: [./services/EGM.md](./services/EGM.md) - Client Firestore
  operations for jokes, ratings and categories, and the fetch client for the
  feedback/samples API; `server/` holds the Admin-SDK stores (exemplars,
  taste feedback and samples, top jokes).
