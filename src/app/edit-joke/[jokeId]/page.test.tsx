import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Joke } from '@/lib/types';

const mocks = vi.hoisted(() => ({
  getJokeById: vi.fn(), updateJoke: vi.fn(), deleteJoke: vi.fn(), toast: vi.fn(), push: vi.fn(),
}));
// Stable objects: the page's load effect depends on `user`, `router` and `toast`.
const stable = vi.hoisted(() => ({ auth: { user: { uid: 'u1' }, loading: false }, router: {} as { push: unknown }, toaster: {} as { toast: unknown }, jokes: {} as Record<string, unknown> }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => stable.auth }));
vi.mock('@/contexts/JokeContext', () => ({
  useJokes: () => Object.assign(stable.jokes, { getJokeById: mocks.getJokeById, updateJoke: mocks.updateJoke, deleteJoke: mocks.deleteJoke, loadingCategories: false }),
}));
vi.mock('next/navigation', () => ({ useParams: () => ({ jokeId: 'j1' }), useRouter: () => Object.assign(stable.router, { push: mocks.push }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => Object.assign(stable.toaster, { toast: mocks.toast }) }));
vi.mock('@/components/header', () => ({ default: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock('@/components/CategoryCombobox', () => ({ CategoryCombobox: ({ value }: { value: string }) => <span>{value}</span> }));
import EditJokePage from './page';

let container: HTMLDivElement; let root: Root;
const baseJoke: Joke = { id: 'j1', userId: 'u1', text: 'A joke', category: 'Work', used: false, funnyRate: 0, dateAdded: new Date(0) };

async function flush() { for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); }); }
async function render(joke: Joke) {
  mocks.getJokeById.mockResolvedValue(joke);
  await act(async () => root.render(<EditJokePage />));
  await flush();
}
function sourceInput() {
  const input = container.querySelector<HTMLInputElement>('input[placeholder="e.g., A friend, a book"]');
  if (!input) throw new Error('Missing source input');
  return input;
}
async function typeSource(value: string) {
  const input = sourceInput();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function submit() {
  await act(async () => { container.querySelector('form')!.requestSubmit(); });
  await flush();
}
const toastTitles = () => mocks.toast.mock.calls.map(([t]) => t.title);

beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  mocks.updateJoke.mockResolvedValue(undefined);
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe('submit without changes', () => {
  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['set', 'Book'],
  ])('a joke whose source is %s shows "Nothing to save" and does not write', async (_label, source) => {
    await render({ ...baseJoke, source });
    await submit();
    expect(toastTitles()).toContain('Nothing to save');
    expect(mocks.updateJoke).not.toHaveBeenCalled();
  });
});

describe('submit with a changed source', () => {
  it.each([
    ['clearing an existing source', 'Book', ''],
    ['adding a source to a joke without one', undefined, 'Radio'],
  ])('%s saves the new value', async (_label, stored, typed) => {
    await render({ ...baseJoke, source: stored });
    await typeSource(typed);
    await submit();
    expect(mocks.updateJoke).toHaveBeenCalledWith('j1', expect.objectContaining({ source: typed }));
    expect(toastTitles()).not.toContain('Nothing to save');
  });
});
