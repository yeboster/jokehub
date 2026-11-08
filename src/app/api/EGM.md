# api

## Overview
Next.js App Router route handlers under `/api/*`. This directory has no source files of its own. Every handler authenticates for itself through `@/lib/auth`, using one of these helpers:
- `verifyApiToken`: shared API token only.
- `verifyRequestAuth`: API token or Firebase ID token.
- `requireUser` (`@/lib/userRouteGuard`): Firebase ID token only.

Handlers that throttle browser callers use the in-memory `@/lib/rateLimit`.

## Subdirectories & Boundaries
- explain-joke: [./explain-joke/EGM.md](./explain-joke/EGM.md) - `POST`. Streams a Genkit explanation of the stored joke text and saves it with `jokes/{jokeId}.update({ explanation })`. Uses `verifyRequestAuth`. Rate limit: 20 requests per 5 minutes, except for API-token callers.
- generate-joke: [./generate-joke/EGM.md](./generate-joke/EGM.md) - `POST`. Runs the joke-generation flow and responds with JSON, or with an NDJSON progress stream when requested. Uses `verifyRequestAuth`. Rate limit: 10 requests per 5 minutes, except for API-token callers. Client error text is limited to an allowlist.
- generated-joke-feedback: [./generated-joke-feedback/EGM.md](./generated-joke-feedback/EGM.md) - `POST`, `GET` and `DELETE` for per-user feedback on generated jokes, through `tasteStore`. POST uses `verifyRequestAuth`; GET and DELETE use `requireUser`.
- joke-samples: [./joke-samples/EGM.md](./joke-samples/EGM.md) - `GET`, `POST`, `PATCH` and `DELETE` for the user's own joke samples, through `tasteStore`. All handlers use `requireUser`.
- jokes: [./jokes/EGM.md](./jokes/EGM.md) - Server-to-server joke endpoints (`add`, `top`). Both use `verifyApiToken`.
