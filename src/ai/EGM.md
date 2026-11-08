# AI (Genkit)

## Overview

This is the Genkit integration layer for Jokehub. It contains the following:

- the shared Genkit instance configured with the Google AI plugin;
- the model catalog, which is the single source of truth for offered models, legacy aliases, and fallback order;
- the in-process model cool-down tracker;
- the Genkit dev entry point.

Flows live in `flows/` and prompt builders live in `prompts/`.

Consumers outside this directory:

- API routes `src/app/api/generate-joke/route.ts` and `src/app/api/explain-joke/route.ts`.
- Client UI and hooks, which import only `models.ts`: `src/components/joke-studio/GeneratedBatch.tsx`, `src/components/joke-studio/GenerationControls.tsx`, and `src/hooks/useRememberedModel.ts`.

## Interface

### `ai-instance.ts`

- `ai`: `genkit({ plugins: [googleAI({ apiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY })] })`.

### `models.ts`

- Types: `ThinkingLevel` (`'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH'`), `GeminiModelInfo` (`id`, `label`, `description`, `thinkingLevel?`, `maxTemperature?`), and `GeminiModel`.
- `GEMINI_MODEL_CATALOG` lists these ids:
  - `googleai/gemini-3.6-flash` (`thinkingLevel: 'LOW'`)
  - `googleai/gemini-3.8-flash` (`thinkingLevel: 'LOW'`)
  - `googleai/gemini-3.5-flash-lite`
  - `googleai/gemini-3.1-flash-lite`
  - `googleai/gemma-4-31b-it` (`maxTemperature: 1`)
  - `googleai/gemma-4-26b-a4b-it` (`maxTemperature: 1`)
- `GEMINI_MODELS` (the id tuple) and `GEMINI_MODEL_LABELS`.
- `DEFAULT_GENERATE_MODEL = 'googleai/gemma-4-31b-it'` and `EXPLAIN_MODEL = 'googleai/gemini-3.5-flash-lite'`.
- `LEGACY_MODEL_ALIASES`:
  - `gemini-3.7-flash` → `gemini-3.8-flash`
  - `gemini-3.5-flash` → `gemini-3.6-flash`
  - `gemini-2.5-flash` → `gemini-3.5-flash-lite`
  - All ids are under the `googleai/` prefix.
- `FALLBACK_ORDER = [gemini-3.5-flash-lite, gemini-3.1-flash-lite, gemini-3.6-flash]` and `MAX_MODEL_CHAIN = 3`.
- `isGeminiModel(value)`, `resolveModelId(value): GeminiModel | null`, `getModelInfo(model)`, and `modelChain(selected): GeminiModel[]`.

### `modelHealth.ts`

- `MODEL_COOL_DOWN_MS = 300_000` (`5 * 60_000`).
- `markModelFailure(model)`, `markModelSuccess(model)`, `isModelCooling(model)`, and `orderByHealth(chain)`.
- Test-only helpers: `setModelHealthClock(next)` and `resetModelHealth()`.

### `dev.ts`

- Genkit dev entry point. It imports `./flows/generate-joke-flow` and `./flows/explain-joke-flow` for their side effects. The package scripts `genkit:dev` and `genkit:watch` run it (`genkit start -- tsx src/ai/dev.ts`).

### Subdirectories

- [flows](./flows/EGM.md): generate and explain flows, model runner, critic selection, lint, and public generation errors.
- [prompts](./prompts/EGM.md): generator and critic prompt builders, craft rules, and cliché list.

## Invariants

- `GEMINI_MODELS` must stay a subset of the catalog ids; the `satisfies` clause enforces this at compile time. `GEMINI_MODEL_LABELS` is derived from the catalog.
- `resolveModelId` accepts a catalog id, or a key of `LEGACY_MODEL_ALIASES` (checked with `Object.hasOwn`) mapped to its replacement. Anything else returns `null`.
- `modelChain(selected)` returns the selected model first, then `FALLBACK_ORDER` without duplicates, truncated to `MAX_MODEL_CHAIN`.
- `getModelInfo` uses a non-null assertion. It must only be called with a `GeminiModel`.
- `orderByHealth` puts healthy models first and cooling models last, and each group keeps its input order.
- `isModelCooling` deletes an expired entry when it reads one.
- Cool-down state is per server instance and never persisted (file header in `modelHealth.ts`).
- `models.ts` has no imports and is imported by client components. It must stay free of server-only code.
- `ai-instance.ts` reads the API key from environment variables. Import it only from server code.

## Side Effects

- `ai-instance.ts` creates the Genkit instance at module load and reads `process.env.GEMINI_API_KEY` or `process.env.GOOGLE_API_KEY`.
- `modelHealth.ts` keeps module-level mutable state: a `coolingUntil` `Map` and a replaceable `clock`, shared across requests in the same process.
- `dev.ts` registers the flows by importing them.
- Network calls to Google AI happen in `flows/` (see the [flows contract](./flows/EGM.md)).
- `models.ts` and `prompts/` have no side effects.

## Verification

- Focused runs:
  - `npm test -- src/ai/models.test.ts`
  - `npm test -- src/ai/modelHealth.test.ts`
- Whole subtree: `npm test -- src/ai`
- Full suite: `npm test`
