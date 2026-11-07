import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GENERATE_MODEL, GEMINI_MODEL_CATALOG, GEMINI_MODEL_LABELS, GEMINI_MODELS,
  getModelInfo, modelChain, resolveModelId,
} from './models';

describe('model catalog', () => {
  it('keeps the id tuple, labels and catalog in sync', () => {
    expect(GEMINI_MODELS).toEqual(GEMINI_MODEL_CATALOG.map(model => model.id));
    for (const model of GEMINI_MODELS) expect(GEMINI_MODEL_LABELS[model]).toBe(getModelInfo(model).label);
    expect(GEMINI_MODELS).toContain(DEFAULT_GENERATE_MODEL);
  });

  it('does not offer retired or routed models', () => {
    for (const retired of ['googleai/gemini-3.7-flash', 'googleai/gemini-3.5-flash', 'googleai/gemini-2.5-flash']) {
      expect(GEMINI_MODELS as readonly string[]).not.toContain(retired);
    }
  });

  it.each([
    ['googleai/gemini-3.6-flash', 'googleai/gemini-3.6-flash'],
    ['googleai/gemini-3.7-flash', 'googleai/gemini-3.8-flash'],
    ['googleai/gemini-3.5-flash', 'googleai/gemini-3.6-flash'],
    ['googleai/gemini-2.5-flash', 'googleai/gemini-3.5-flash-lite'],
    ['googleai/gemini-9-flash', null],
    ['toString', null],
    [undefined, null],
  ])('resolves %s to %s', (input, expected) => {
    expect(resolveModelId(input)).toBe(expected);
  });

  it('builds a capped fallback chain that starts with the selection and has no duplicates', () => {
    expect(modelChain('googleai/gemini-3.6-flash')).toEqual([
      'googleai/gemini-3.6-flash', 'googleai/gemini-3.5-flash-lite', 'googleai/gemini-3.1-flash-lite',
    ]);
    expect(modelChain('googleai/gemini-3.5-flash-lite')).toEqual([
      'googleai/gemini-3.5-flash-lite', 'googleai/gemini-3.1-flash-lite', 'googleai/gemini-3.6-flash',
    ]);
    for (const model of GEMINI_MODELS) {
      const chain = modelChain(model);
      expect(chain[0]).toBe(model);
      expect(new Set(chain).size).toBe(chain.length);
      expect(chain.length).toBeLessThanOrEqual(3);
    }
  });

  it('only sets a thinking level on non-lite models', () => {
    for (const model of GEMINI_MODEL_CATALOG) {
      if (model.id.includes('lite')) expect('thinkingLevel' in model).toBe(false);
    }
  });
});
