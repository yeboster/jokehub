/**
 * Single source of truth for Gemini model identifiers used in the app.
 *
 * These IDs match the `KNOWN_GEMINI_MODELS` registry exported by
 * `@genkit-ai/google-genai@^1.41.0` and are validated server-side by the
 * `@genkit-ai/google-genai` plugin.
 */

export const GEMINI_MODELS = [
  'googleai/gemini-3.5-flash',
  'googleai/gemini-3.1-flash-lite',
  'googleai/gemini-2.5-flash',
] as const;

export type GeminiModel = (typeof GEMINI_MODELS)[number];

export const DEFAULT_GENERATE_MODEL: GeminiModel = 'googleai/gemini-3.5-flash';

export const EXPLAIN_MODEL: GeminiModel = 'googleai/gemini-3.1-flash-lite';