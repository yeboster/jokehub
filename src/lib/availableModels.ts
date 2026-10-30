import { GEMINI_MODELS } from '@/ai/models';

export type ModelOption = { id: string; label: string };

/** Runtime-discovered models for the picker; any failure just means none. */
export async function fetchExtraModels(signal?: AbortSignal): Promise<ModelOption[]> {
  try {
    const response = await fetch('/api/models', { signal });
    if (!response.ok) return [];
    const { models } = await response.json() as { models?: unknown };
    if (!Array.isArray(models)) return [];
    const seen = new Set<string>(GEMINI_MODELS);
    return models.flatMap(model => {
      const { id, label } = (model ?? {}) as Partial<Record<'id' | 'label', unknown>>;
      if (typeof id !== 'string' || typeof label !== 'string' || seen.has(id)) return [];
      seen.add(id);
      return [{ id, label }];
    });
  } catch {
    return [];
  }
}
