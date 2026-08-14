# JokeHub Refactor + Gemini Model Upgrade — 2026-08-14

Repo: /opt/data/work/jokehub (Next.js 16, Genkit, Firebase). Branch: `refactor/ai-models-and-cleanup`.

## Goals
1. Update Gemini models used for joke generation/explanation to current, valid models.
2. Refactor: type safety, dedupe, dead code, working lint.

## Tasks

### T1 — AI layer: plugin migration + model update
- Replace deprecated `@genkit-ai/googleai` with `@genkit-ai/google-genai@^1.41.0`; bump `genkit` to `^1.41.0`, `@genkit-ai/next` to `^1.41.0`.
- New file `src/ai/models.ts`: single source of truth
  - `GEMINI_MODELS = ['googleai/gemini-3.5-flash', 'googleai/gemini-3.1-flash-lite', 'googleai/gemini-2.5-flash'] as const`
  - `DEFAULT_GENERATE_MODEL = 'googleai/gemini-3.5-flash'`
  - `EXPLAIN_MODEL = 'googleai/gemini-3.1-flash-lite'`
- `generate-joke-flow.ts`: zod enum from GEMINI_MODELS, default = DEFAULT_GENERATE_MODEL (fixes the broken `gemini-3-flash` default that isn't in the enum), remove `console.error(res)` debug dump.
- `explain-joke-flow.ts`: model = EXPLAIN_MODEL.
- `api/generate-joke/route.ts` + `app/add-joke/page.tsx`: import the shared model list instead of redeclaring the enum (3 copies today).
- Remove `'use server'` from both flow files (they're only called from API routes).
- ai-instance.ts: import `googleAI` from `@genkit-ai/google-genai` (API-compatible: `googleAI({apiKey})`); keep GEMINI_API_KEY ?? GOOGLE_API_KEY fallback; drop unused `promptDir` if unsupported.
- Verify: `npm run typecheck` passes for ai/ files; `npm install` clean.

### T2 — Type safety: kill the 28 typecheck errors
- `src/lib/firebase.ts`: fail-fast at init when config missing; export `db: Firestore` / `auth: Auth` non-nullable; gate verbose logs behind `NODE_ENV !== 'production'`.
- Fix `AuthContext.tsx` auth-undefined errors, `edit-joke/[jokeId]/page.tsx` `boolean | null` vs `boolean | undefined` (coerce with `?? undefined` or zod default), landing `page.tsx` missing `FilterParams.search`.
- `next.config.ts`: remove `ignoreBuildErrors: true` and `ignoreDuringBuilds: true`.
- Verify: `npm run typecheck` → 0 errors.

### T3 — Dedupe + dead code + rating fix
- Extract `generateKeywords()` (duplicated in `jokeService.ts:29` and `api/jokes/add/route.ts:35`) into `src/lib/text.ts`; reuse both places.
- Delete: `.modified` (0-byte), dead commented Header import in `app/joke/[jokeId]/page.tsx:14`, `src/components/ui/sidebar.tsx` + `src/components/ui/combobox.tsx` ONLY after grep confirms zero real imports.
- `jokeService.ts:227`: replace `'server-process'` magic string with exported const `SYSTEM_USER_ID`.
- `ratingService.submitUserRating`: fix `Math.floor` average truncation — round to 1 decimal (`Math.round(avg*10)/10`).
- JokeContext: remove `rateJoke` dead public method (grep-verified unused).

### T4 — Working ESLint
- Next 16 removed `next lint`. Add `eslint.config.mjs` flat config (next/core-web-vitals + typescript), devDeps eslint + eslint-config-next matching Next 16.
- `package.json` script: `"lint": "eslint ."`.
- Fix or consciously disable resulting errors (no mass-warning silencing).
- Verify: `npm run lint` exits 0.

### T5 — Final verification
- `npm run typecheck` 0 errors, `npm run lint` 0, `npm run build` succeeds.
- `git diff --stat` review; commit logically grouped commits on branch `refactor/ai-models-and-cleanup`.

### T6 — Gemini 3.6/3.7 + generation quality (added per user 2026-08-14)
- models.ts lineup: gemini-3.7-flash, 3.6-flash (default), 3.5-flash, 3.5-flash-lite (EXPLAIN), 3.1-flash-lite, 2.5-flash. No 3.6/3.7 flash-lite exists — lite trails a generation. Plugin stays at 1.41.0 (latest; unknown gemini-* IDs resolve generically).
- Quality: generate-and-rerank — 6 candidates → critic pass scores (surprise, originality, economy, no clichés) → top 3 returned. Few-shot exemplars from user's 5-star jokes (new `exemplarJokes` input, plumbed route → page). Prompt upgrade: craft principles + cliché blacklist.

## Explicitly out of scope (reported to user as follow-ups)
- Splitting JokeContext / mega-pages, adopting react-query, Firestore rules deploy + composite indexes (needs Firebase auth), persist-explanation-to-Firestore feature, category privacy rules change.
