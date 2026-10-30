import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchExtraModels } from './availableModels';

const fetchMock = vi.fn();
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });

describe('fetchExtraModels', () => {
  it('reads /api/models and keeps well-formed entries, skipping duplicates and built-in Gemini IDs', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ models: [
      { id: 'opencode/a', label: 'A (OpenCode)' }, { id: 'opencode/a', label: 'dup' },
      { id: 'googleai/gemini-3.6-flash', label: 'shadow' }, { id: 'opencode/b' }, null, { id: 7, label: 'x' },
    ] }) });
    const signal = new AbortController().signal;
    expect(await fetchExtraModels(signal)).toEqual([{ id: 'opencode/a', label: 'A (OpenCode)' }]);
    expect(fetchMock).toHaveBeenCalledWith('/api/models', { signal });
  });
  it.each([
    ['network failure', () => fetchMock.mockRejectedValue(new Error('offline'))],
    ['server error', () => fetchMock.mockResolvedValue({ ok: false, json: async () => ({ models: [{ id: 'opencode/a', label: 'A' }] }) })],
    ['bad JSON', () => fetchMock.mockResolvedValue({ ok: true, json: async () => { throw new SyntaxError('bad'); } })],
    ['wrong shape', () => fetchMock.mockResolvedValue({ ok: true, json: async () => ({ models: 'nope' }) })],
  ])('returns no extra models on %s', async (_, arrange) => {
    arrange();
    expect(await fetchExtraModels()).toEqual([]);
  });
});
