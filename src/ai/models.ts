/**
 * Single source of truth for Gemini model identifiers used in the app.
 *
 * These IDs are validated by the `@genkit-ai/google-genai` plugin registry
 * (any gemini-* name is also forwarded generically server-side, so future
 * stable releases can be added here without a plugin bump).
 */
export const GEMINI_MODELS = [
  'googleai/gemini-3.7-flash',
  'googleai/gemini-3.6-flash',
  'googleai/gemini-3.5-flash',
  'googleai/gemini-3.5-flash-lite',
  'googleai/gemini-3.1-flash-lite',
  'googleai/gemini-2.5-flash',
] as const;

export type GeminiModel = (typeof GEMINI_MODELS)[number];

/**
 * Friendly display labels for each Gemini model. Use these in the UI so
 * users see "Gemini 3.6 Flash" instead of the raw "googleai/gemini-3.6-flash"
 * slug. Keep keys in sync with GEMINI_MODELS.
 */
export const GEMINI_MODEL_LABELS: Record<GeminiModel, string> = {
  'googleai/gemini-3.7-flash': 'Gemini 3.7 Flash',
  'googleai/gemini-3.6-flash': 'Gemini 3.6 Flash',
  'googleai/gemini-3.5-flash': 'Gemini 3.5 Flash',
  'googleai/gemini-3.5-flash-lite': 'Gemini 3.5 Flash-Lite',
  'googleai/gemini-3.1-flash-lite': 'Gemini 3.1 Flash-Lite',
  'googleai/gemini-2.5-flash': 'Gemini 2.5 Flash',
};

/**
 * Newest confirmed-stable flash model — used as the default for joke
 * generation so users get the highest-quality default without picking a
 * model manually.
 */
export const DEFAULT_GENERATE_MODEL: GeminiModel = 'googleai/gemini-3.6-flash';

/**
 * Newest flash-lite model. The flash-lite line trails the regular flash
 * line by one generation, so when 3.6/3.7 are current, 3.5-flash-lite is
 * the latest available `-lite` and is used for the cheaper, explain-style
 * follow-up calls.
 */
export const EXPLAIN_MODEL: GeminiModel = 'googleai/gemini-3.5-flash-lite';
