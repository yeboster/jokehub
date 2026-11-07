/**
 * Single source of truth for the Gemini models offered in the app.
 *
 * Catalog checked against Google's model and deprecation pages on 2026-11-07:
 * 3.6 Flash and 3.5/3.1 Flash-Lite are stable, 3.8 Flash is new. 3.7 Flash
 * and 3.5 Flash are no longer listed (the endpoint auto-routes them) and
 * 2.5 Flash is deprecated, so they are accepted only as legacy aliases.
 * Any `gemini-*` id is forwarded by `@genkit-ai/google-genai`, so ids the
 * installed plugin does not list still resolve.
 */
export type ThinkingLevel = 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH';

export type GeminiModelInfo = {
  id: string;
  label: string;
  description: string;
  /**
   * Sent as `thinkingConfig.thinkingLevel`. Only set where it is known to be
   * supported; Flash-Lite models already work without it.
   */
  thinkingLevel?: ThinkingLevel;
};

export const GEMINI_MODEL_CATALOG = [
  { id: 'googleai/gemini-3.6-flash', label: 'Gemini 3.6 Flash', description: 'Best balance of wit and speed', thinkingLevel: 'LOW' },
  { id: 'googleai/gemini-3.8-flash', label: 'Gemini 3.8 Flash', description: 'Newest model; can be busier', thinkingLevel: 'LOW' },
  { id: 'googleai/gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', description: 'Fastest and most reliable (default)' },
  { id: 'googleai/gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite', description: 'Backup model; retires May 2027' },
] as const satisfies readonly GeminiModelInfo[];

export const GEMINI_MODELS = [
  'googleai/gemini-3.6-flash',
  'googleai/gemini-3.8-flash',
  'googleai/gemini-3.5-flash-lite',
  'googleai/gemini-3.1-flash-lite',
] as const satisfies readonly (typeof GEMINI_MODEL_CATALOG)[number]['id'][];

export type GeminiModel = (typeof GEMINI_MODELS)[number];

export const GEMINI_MODEL_LABELS: Record<GeminiModel, string> = Object.fromEntries(
  GEMINI_MODEL_CATALOG.map(model => [model.id, model.label]),
) as Record<GeminiModel, string>;

/** The owner reports this as the model that works reliably for them. */
export const DEFAULT_GENERATE_MODEL: GeminiModel = 'googleai/gemini-3.5-flash-lite';

/** Cheap, reliable model for explain-style follow-up calls. */
export const EXPLAIN_MODEL: GeminiModel = 'googleai/gemini-3.5-flash-lite';

/** Retired or routed ids that API callers may still send. */
export const LEGACY_MODEL_ALIASES: Readonly<Record<string, GeminiModel>> = {
  'googleai/gemini-3.7-flash': 'googleai/gemini-3.8-flash',
  'googleai/gemini-3.5-flash': 'googleai/gemini-3.6-flash',
  'googleai/gemini-2.5-flash': 'googleai/gemini-3.5-flash-lite',
};

/** Order tried after the selected model fails. */
export const FALLBACK_ORDER: readonly GeminiModel[] = [
  'googleai/gemini-3.5-flash-lite',
  'googleai/gemini-3.1-flash-lite',
  'googleai/gemini-3.6-flash',
];

export const MAX_MODEL_CHAIN = 3;

export function isGeminiModel(value: unknown): value is GeminiModel {
  return typeof value === 'string' && (GEMINI_MODELS as readonly string[]).includes(value);
}

/** Catalog id, or a legacy alias mapped to its replacement; otherwise null. */
export function resolveModelId(value: unknown): GeminiModel | null {
  if (isGeminiModel(value)) return value;
  if (typeof value === 'string' && Object.hasOwn(LEGACY_MODEL_ALIASES, value)) return LEGACY_MODEL_ALIASES[value];
  return null;
}

export function getModelInfo(model: GeminiModel): (typeof GEMINI_MODEL_CATALOG)[number] {
  return GEMINI_MODEL_CATALOG.find(entry => entry.id === model)!;
}

/** Selected model first, then the fallback order without duplicates, capped. */
export function modelChain(selected: GeminiModel): GeminiModel[] {
  return [selected, ...FALLBACK_ORDER.filter(model => model !== selected)].slice(0, MAX_MODEL_CHAIN);
}
