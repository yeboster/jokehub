import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ toast: vi.fn(), getJokeById: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('./AuthContext', () => ({ useAuth: () => ({ user: null, loading: false }) }));
vi.mock('@/services/jokeService', () => ({ getJokeById: mocks.getJokeById }));
vi.mock('@/services/categoryService', () => ({}));
vi.mock('@/services/ratingService', () => ({}));
import { JokeProvider, useJokes } from './JokeContext';

let container: HTMLDivElement; let root: Root;
let context: ReturnType<typeof useJokes>;
const capture = (value: ReturnType<typeof useJokes>) => { context = value; };
function Capture({ onValue }: { onValue: typeof capture }) { onValue(useJokes()); return null; }

beforeEach(async () => {
  vi.resetAllMocks(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<JokeProvider><Capture onValue={capture} /></JokeProvider>); });
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('getJokeById', () => {
  it('returns null for a missing joke without a toast', async () => {
    mocks.getJokeById.mockResolvedValue(null);
    await expect(context.getJokeById('j1')).resolves.toBeNull();
    expect(mocks.toast).not.toHaveBeenCalled();
  });
  it('rethrows a failed read without a toast, so the page can tell it from a missing joke', async () => {
    const failure = new Error('offline');
    mocks.getJokeById.mockRejectedValue(failure);
    await expect(context.getJokeById('j1')).rejects.toBe(failure);
    expect(mocks.toast).not.toHaveBeenCalled();
  });
});
