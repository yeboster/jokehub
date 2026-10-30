// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ openCodeModels: vi.fn() }));
vi.mock('@/ai/opencode', () => ({ fetchOpenCodeModels: mocks.openCodeModels }));
import { GET } from './route';

beforeEach(() => { vi.clearAllMocks(); });

describe('GET /api/models', () => {
  it('returns the extra models the generator accepts, with a short private cache', async () => {
    mocks.openCodeModels.mockResolvedValue([{ id: 'opencode/glm-5.3-flash', label: 'GLM-5.3-Flash (OpenCode)' }]);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ models: [{ id: 'opencode/glm-5.3-flash', label: 'GLM-5.3-Flash (OpenCode)' }] });
    expect(response.headers.get('Cache-Control')).toBe('private, max-age=300');
  });
  it('answers with an empty list instead of an error when discovery fails', async () => {
    mocks.openCodeModels.mockRejectedValue(new Error('SECRET'));
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ models: [] });
  });
});
