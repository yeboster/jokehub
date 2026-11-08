# api/jokes

## Overview
Groups the joke endpoints for server-to-server callers. This directory has no source files of its own. Both child routes accept only the shared API token (`verifyApiToken` from `@/lib/auth`) and use the Firebase Admin SDK.

## Subdirectories & Boundaries
- add: [./add/EGM.md](./add/EGM.md) - `POST /api/jokes/add`. Creates a `jokes/{autoId}` document owned by `JOKEHUB_JARVIS_USER_ID`, with zeroed rating fields and generated `keywords`.
- top: [./top/EGM.md](./top/EGM.md) - `GET /api/jokes/top`. Returns top-rated jokes from `fetchTopJokes`, with `limit` clamped to `[1, 50]` (default 10) and `minRating` clamped to `[0, 5]` (default 4).
