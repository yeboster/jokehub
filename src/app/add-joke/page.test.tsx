import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ auth: { user: null as null | { uid: string; getIdToken: () => Promise<string> }, loading: false }, fetch: vi.fn(), inspiration: vi.fn(), toast: vi.fn(), push: vi.fn(), add: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/contexts/JokeContext', () => ({ useJokes: () => ({ addJoke: mocks.add }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/services/jokeService', () => ({ fetchUserFiveStarJokes: mocks.inspiration }));
vi.mock('@/components/add-joke-form', () => ({ default: ({ aiGeneratedText }: { aiGeneratedText?: string }) => <div data-selected>{aiGeneratedText}</div> }));
import AddJokePage from './page';
import { DEFAULT_GENERATE_MODEL } from '@/ai/models';
let container: HTMLDivElement; let root: Root;
const batch = (n: number) => ({ jokes: [0, 1, 2].map(i => ({ jokeText: `batch ${n} joke ${i}`, category: 'Work' })) });
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const response = (value: unknown, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => value });
async function settle(fn: () => void = () => {}) { await act(async () => { fn(); }); }
async function render() { await settle(() => root.render(<AddJokePage />)); }
function button(text: string) { const found = [...container.querySelectorAll('button')].find(el => el.textContent?.includes(text)); if (!found) throw new Error(`Missing button ${text}`); return found; }
async function generate() { await settle(() => button('Generate').click()); }
function bodies() { return mocks.fetch.mock.calls.map(([, options]) => JSON.parse(options.body)); }
function user(uid: string, token: () => Promise<string> = async () => `token-${uid}`) { return { uid, getIdToken: token }; }
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.resetAllMocks(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('fetch', mocks.fetch);
  mocks.auth.user = user('a'); mocks.auth.loading = false;
  mocks.inspiration.mockResolvedValue([]); mocks.fetch.mockResolvedValue(response(batch(1)));
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await settle(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe('recent generation memory', () => {
  it('second request sends prior ranked batch separately, retains latest 12 and excludes failed batch', async () => {
    await render();
    for (let n = 1; n <= 5; n++) { mocks.fetch.mockResolvedValueOnce(response(batch(n))); await generate(); }
    expect(bodies()[1].recentGeneratedJokes).toEqual(batch(1).jokes.map(j => j.jokeText));
    mocks.fetch.mockResolvedValueOnce(response({ error: 'failed' }, false)); await generate();
    mocks.fetch.mockResolvedValueOnce(response(batch(6))); await generate();
    const expected = [5, 4, 3, 2].flatMap(n => batch(n).jokes.map(j => j.jokeText));
    expect(bodies().at(-1).recentGeneratedJokes).toEqual(expected);
    expect(bodies().at(-1).prefilledJokes).toEqual([]);
    expect(bodies()[0].model).toBe(DEFAULT_GENERATE_MODEL);
    expect(bodies()[0].temperature).toBe(0.8);
    expect(mocks.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer token-a');
    expect(container.querySelector('[role="status"]')).not.toBeNull();
  });
  it('keeps newest original spelling/rank while deduping normalized older history', async () => {
    await render(); await generate();
    mocks.fetch.mockResolvedValueOnce(response({ jokes: [{ jokeText: 'ＢＡＴＣＨ 1 JOKE 1!!!', category: 'Work' }, ...batch(2).jokes.slice(0, 2)] }));
    await generate(); await generate();
    expect(bodies()[2].recentGeneratedJokes).toEqual(['ＢＡＴＣＨ 1 JOKE 1!!!', 'batch 2 joke 0', 'batch 2 joke 1', 'batch 1 joke 0', 'batch 1 joke 2']);
  });
  it.each([{ jokes: [] }, { jokes: [{ jokeText: 'bad' }] }, { jokes: batch(1).jokes.map(j => ({ ...j, jokeText: '!!!' })) }, { jokes: batch(1).jokes.map(j => ({ ...j, jokeText: 'x'.repeat(2001) })) }, { jokes: batch(1).jokes.map(j => ({ ...j, category: ' ' })) }])('rejects malformed response before cards/history: %j', async malformed => {
    await render(); mocks.fetch.mockResolvedValueOnce(response(malformed)); await generate();
    expect(container.textContent).not.toContain('Choose Your Favorite');
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Couldn't generate jokes" }));
    await generate(); expect(bodies()[1].recentGeneratedJokes).toEqual([]);
  });
  it('same-render duplicate clicks launch one request', async () => {
    const pending = deferred<ReturnType<typeof response>>(); mocks.fetch.mockReturnValue(pending.promise);
    await render(); const generateButton = button('Generate');
    await settle(() => { generateButton.click(); generateButton.click(); });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    await settle(() => pending.resolve(response(batch(1))));
  });
});

describe('request/session authority', () => {
  it.each(['token', 'fetch', 'json', 'reject'] as const)('old %s completion cannot mutate new-session cards, history, toasts or loading', async boundary => {
    const token = deferred<string>(); const fetch = deferred<ReturnType<typeof response>>(); const json = deferred<unknown>();
    mocks.auth.user = user('a', boundary === 'token' ? () => token.promise : undefined);
    if (boundary !== 'token') mocks.fetch.mockImplementationOnce(() => boundary === 'json' ? { ok: true, json: () => json.promise } : fetch.promise);
    await render(); await generate();
    const oldSignal = mocks.fetch.mock.calls[0]?.[1].signal;
    mocks.auth.user = user('b'); await render();
    expect(container.textContent).not.toContain('batch 1');
    const current = deferred<ReturnType<typeof response>>(); mocks.fetch.mockReturnValueOnce(current.promise);
    await generate(); expect(bodies().at(-1).recentGeneratedJokes).toEqual([]);
    const count = mocks.toast.mock.calls.length;
    await settle(() => { if (boundary === 'token') token.resolve('old-token'); else if (boundary === 'json') json.resolve(batch(99)); else if (boundary === 'reject') fetch.reject(new Error('stale')); else fetch.resolve(response(batch(99))); });
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Generating witty humor…');
    expect(container.textContent).not.toContain('batch 99');
    expect(mocks.toast).toHaveBeenCalledTimes(count);
    if (oldSignal) expect(oldSignal.aborted).toBe(true);
    await settle(() => current.resolve(response(batch(2))));
    expect(container.textContent).toContain('batch 2 joke 0');
    await generate(); expect(bodies().at(-1).recentGeneratedJokes).toEqual(batch(2).jokes.map(j => j.jokeText));
  });
  it('sign-out resets history, cards, selection and inspiration; unmount invalidates pending JSON', async () => {
    await render(); await generate(); await settle(() => button('Use this Joke').click());
    mocks.inspiration.mockResolvedValueOnce(['reference']); await settle(() => button('Load My').click());
    mocks.auth.user = null; await render(); mocks.auth.user = user('a'); await render();
    expect(container.textContent).not.toContain('Choose Your Favorite'); expect(container.querySelector('[data-selected]')?.textContent).toBe('');
    const json = deferred<unknown>(); mocks.fetch.mockResolvedValueOnce({ ok: true, json: () => json.promise }); await generate();
    expect(bodies().at(-1).recentGeneratedJokes).toEqual([]); expect(bodies().at(-1).prefilledJokes).toEqual([]);
    const calls = mocks.toast.mock.calls.length; const signal = mocks.fetch.mock.calls.at(-1)![1].signal;
    await settle(() => root.unmount()); await settle(() => json.resolve(batch(99)));
    expect(mocks.toast).toHaveBeenCalledTimes(calls); expect(signal.aborted).toBe(true);
    root = createRoot(container);
  });
});

it.each(['token', 'fetch', 'error-json'] as const)('unmount during %s blocks completion and toast', async boundary => {
  const token = deferred<string>(); const pending = deferred<ReturnType<typeof response>>(); const json = deferred<unknown>();
  mocks.auth.user = user('a', boundary === 'token' ? () => token.promise : undefined);
  if (boundary === 'fetch') mocks.fetch.mockReturnValueOnce(pending.promise);
  if (boundary === 'error-json') mocks.fetch.mockResolvedValueOnce({ ok: false, status: 500, json: () => json.promise });
  await render(); await generate(); const count = mocks.toast.mock.calls.length;
  await settle(() => root.unmount());
  await settle(() => { if (boundary === 'token') token.resolve('late-token'); else if (boundary === 'fetch') pending.resolve(response(batch(99))); else json.resolve({ error: 'late error' }); });
  expect(mocks.toast).toHaveBeenCalledTimes(count);
  if (boundary === 'token') expect(mocks.fetch).not.toHaveBeenCalled();
  root = createRoot(container);
});

it('StrictMode setup-cleanup-setup permits current generation while invalidating unmount', async () => {
  await settle(() => root.render(<StrictMode><AddJokePage /></StrictMode>));
  await generate();
  expect(container.textContent).toContain('batch 1 joke 0');
  await generate();
  expect(bodies()[1].recentGeneratedJokes).toEqual(batch(1).jokes.map(j => j.jokeText));
});
it.each(['token', 'json', 'error-json'] as const)('sign-out during %s revokes old request and clears memory', async boundary => {
  const token = deferred<string>(); const json = deferred<unknown>();
  mocks.auth.user = user('a', boundary === 'token' ? () => token.promise : undefined);
  if (boundary !== 'token') mocks.fetch.mockResolvedValueOnce({ ok: boundary !== 'error-json', status: 500, json: () => json.promise });
  await render(); await generate();
  mocks.auth.user = null; await render();
  const calls = mocks.toast.mock.calls.length;
  await settle(() => { if (boundary === 'token') token.resolve('old-token'); else json.resolve(boundary === 'error-json' ? { error: 'stale error' } : batch(99)); });
  expect(mocks.toast).toHaveBeenCalledTimes(calls);
  expect(container.textContent).not.toContain('batch 99');
  mocks.auth.user = user('b'); await render(); await generate();
  expect(bodies().at(-1).recentGeneratedJokes).toEqual([]);
});
it('auth loading unmounts prior session and revokes pending JSON', async () => {
  const json = deferred<unknown>(); mocks.fetch.mockResolvedValueOnce({ ok: true, json: () => json.promise });
  await render(); await generate(); mocks.auth.loading = true; await render();
  const calls = mocks.toast.mock.calls.length; await settle(() => json.resolve(batch(99)));
  expect(mocks.toast).toHaveBeenCalledTimes(calls);
  mocks.auth.loading = false; await render(); await generate();
  expect(bodies().at(-1).recentGeneratedJokes).toEqual([]);
});

describe('inspiration ownership', () => {
  it('filters malformed/overlong inspirations and caps transport without truncation', async () => {
    mocks.inspiration.mockResolvedValue(['!!!', null, 'x'.repeat(2001), ...Array.from({ length: 30 }, (_, i) => `Reference ${i}`)]);
    await render(); await settle(() => button('Load My').click()); await generate();
    expect(bodies()[0].prefilledJokes).toEqual(Array.from({ length: 25 }, (_, i) => `Reference ${i}`));
    expect(bodies()[0].exemplarJokes).toEqual(Array.from({ length: 10 }, (_, i) => `Reference ${i}`));
  });
  it('generation completion cannot erase newer pending/load inspiration', async () => {
    const inspiration = deferred<string[]>(); mocks.inspiration.mockReturnValueOnce(inspiration.promise);
    const generated = deferred<ReturnType<typeof response>>(); mocks.fetch.mockReturnValueOnce(generated.promise);
    await render(); await settle(() => button('Load My').click()); await generate();
    await settle(() => inspiration.resolve(['new reference'])); await settle(() => generated.resolve(response(batch(1))));
    expect(container.textContent).toContain('1 joke will be used for inspiration.');
    await generate(); expect(bodies()[1].prefilledJokes).toEqual(['new reference']);
  });
  it('old inspiration cannot repopulate new session or toast after sign-out', async () => {
    const pending = deferred<string[]>(); mocks.inspiration.mockReturnValueOnce(pending.promise);
    await render(); await settle(() => button('Load My').click());
    mocks.auth.user = null; await render(); mocks.auth.user = user('b'); await render();
    const calls = mocks.toast.mock.calls.length; await settle(() => pending.resolve(['stale reference']));
    expect(mocks.toast).toHaveBeenCalledTimes(calls); await generate(); expect(bodies()[0].prefilledJokes).toEqual([]);
  });
  it('latest inspiration operation wins same-render repeated loads; old rejection cannot clear loading or toast', async () => {
    const old = deferred<string[]>(); const latest = deferred<string[]>();
    mocks.inspiration.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
    await render(); const load = button('Load My');
    await settle(() => { load.click(); load.click(); });
    const calls = mocks.toast.mock.calls.length;
    await settle(() => old.reject(new Error('stale load')));
    expect(button('Loading Jokes').disabled).toBe(true);
    expect(mocks.toast).toHaveBeenCalledTimes(calls);
    await settle(() => latest.resolve(['latest reference'])); await generate();
    expect(bodies()[0].prefilledJokes).toEqual(['latest reference']);
  });

});
