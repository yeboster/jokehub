import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  auth: { user: null as null | { uid: string; getIdToken: () => Promise<string> }, loading: false },
  fetch: vi.fn(), inspiration: vi.fn(), toast: vi.fn(), push: vi.fn(), add: vi.fn(),
  formData: { text: 'typed joke', category: 'Work', source: '' } as { text: string; category: string; source?: string },
  formResult: vi.fn(), acceptPrefill: true,
  taste: {
    listFeedback: vi.fn(), setFeedback: vi.fn(), clearFeedback: vi.fn(), listSamples: vi.fn(),
    createSample: vi.fn(), updateSample: vi.fn(), deleteSample: vi.fn(),
  },
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/contexts/JokeContext', () => ({ useJokes: () => ({ addJoke: mocks.add, loadingCategories: false }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('next/link', () => ({ default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a> }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/services/jokeService', () => ({ fetchUserFiveStarJokes: mocks.inspiration }));
vi.mock('@/services/tasteService', () => mocks.taste);
// The real form is covered by its own suite; here it only reports what the page gives it.
vi.mock('@/components/add-joke-form', async () => {
  const { useEffect } = await import('react');
  return { default: function MockForm({ prefill, onAddJoke, onPrefillApplied }: { prefill?: { key: string; text: string } | null; onAddJoke: (data: unknown) => Promise<void>; onPrefillApplied?: (key: string) => void }) {
    useEffect(() => { if (prefill && mocks.acceptPrefill) onPrefillApplied?.(prefill.key); }, [prefill, onPrefillApplied]);
    return (
    <div>
      <div data-prefill>{prefill?.text ?? ''}</div>
      <button type="button" onClick={() => { onAddJoke(mocks.formData).then(() => mocks.formResult('resolved'), error => mocks.formResult('rejected', error)); }}>Mock form save</button>
    </div>
    );
  } };
});
import AddJokePage from './page';
import { DEFAULT_GENERATE_MODEL } from '@/ai/models';
let container: HTMLDivElement; let root: Root;
const MODEL = 'googleai/gemini-3.5-flash-lite';
const batch = (n: number, size = 3, extra: Record<string, unknown> = {}) => ({ jokes: Array.from({ length: size }, (_, i) => ({ jokeText: `batch ${n} joke ${i}`, category: 'Work' })), model: MODEL, requestedCount: 3, ...extra });
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const response = (value: unknown, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => value });
async function settle(fn: () => void = () => {}) { await act(async () => { fn(); }); }
async function render() { await settle(() => root.render(<AddJokePage />)); }
function buttons() { return [...container.querySelectorAll('button')]; }
function button(text: string, scope: ParentNode = container) { const found = [...scope.querySelectorAll('button')].find(el => el.textContent?.includes(text)); if (!found) throw new Error(`Missing button ${text}`); return found as HTMLButtonElement; }
function named(name: string, scope: ParentNode = container) { const found = [...scope.querySelectorAll('button')].find(el => el.getAttribute('aria-label') === name); if (!found) throw new Error(`Missing ${name}`); return found as HTMLButtonElement; }
function card(text: string) { const found = [...container.querySelectorAll('li[data-studio-joke]')].find(el => el.textContent?.includes(text)); if (!found) throw new Error(`Missing card ${text}`); return found as HTMLElement; }
async function generate() { await settle(() => button('Generate').click()); }
function bodies() { return mocks.fetch.mock.calls.map(([, options]) => JSON.parse(options.body)); }
function user(uid: string, token: () => Promise<string> = async () => `token-${uid}`) { return { uid, getIdToken: token }; }
function feedbackRecord(input: { jokeText: string; vote?: 'up' | 'down' | null; saved?: boolean; reason?: string | null }) {
  const id = Array.from(input.jokeText).map(c => c.charCodeAt(0).toString(16)).join('').padEnd(32, '0').slice(0, 32);
  return { id, jokeText: input.jokeText, vote: input.vote ?? null, saved: input.saved ?? false, updatedAt: '2026-11-07T00:00:00.000Z', ...(input.reason ? { reason: input.reason } : {}) };
}
function toastTitles() { return mocks.toast.mock.calls.map(([t]) => t.title); }
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.resetAllMocks(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('fetch', mocks.fetch);
  sessionStorage.clear(); localStorage.clear();
  mocks.auth.user = user('a'); mocks.auth.loading = false;
  mocks.formData = { text: 'typed joke', category: 'Work', source: '' }; mocks.acceptPrefill = true;
  mocks.inspiration.mockResolvedValue([]); mocks.fetch.mockResolvedValue(response(batch(1)));
  mocks.taste.listFeedback.mockResolvedValue({ feedback: [], counts: { liked: 0, disliked: 0 } });
  mocks.taste.listSamples.mockResolvedValue([]);
  mocks.taste.setFeedback.mockImplementation(async (_auth, input) => (input.vote || input.saved ? feedbackRecord(input) : null));
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await settle(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe('visible generation progress', () => {
  it('shows real server stage and request ID while pending, then keeps errors inline with retry', async () => {
    let enqueue!: (value: unknown) => void; let close!: () => void;
    mocks.fetch.mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers({ 'Content-Type': 'application/x-ndjson', 'x-request-id': 'req-ui' }), body: new ReadableStream({ start(controller) { enqueue = value => controller.enqueue(new TextEncoder().encode(JSON.stringify(value) + '\n')); close = () => controller.close(); } }) });
    await render(); await generate();
    await settle(() => enqueue({ type: 'progress', requestId: 'req-ui', stage: 'reviewing', elapsedMs: 1000, callCount: 2 }));
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Reviewing quality');
    expect(container.textContent).toContain('req-ui');
    expect(mocks.fetch.mock.calls[0][1].headers.Accept).toBe('application/x-ndjson');
    await settle(() => enqueue({ type: 'progress', requestId: 'req-ui', stage: 'fallback', elapsedMs: 2000, callCount: 3, model: 'googleai/gemini-3.1-flash-lite' }));
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Switching to a backup model… (Gemini 3.1 Flash-Lite)');
    await settle(() => { enqueue({ type: 'error', requestId: 'req-ui', error: 'Joke quality check failed. Please try again.', code: 'QUALITY_CHECK_FAILED' }); close(); });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Joke quality check failed');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('req-ui');
    expect(button('Try again').disabled).toBe(false);
  });
  it('stale streamed progress/error cannot cross an account switch', async () => {
    let enqueue!: (value: unknown) => void; let close!: () => void;
    mocks.fetch.mockResolvedValueOnce({ ok: true, headers: new Headers({ 'Content-Type': 'application/x-ndjson' }), body: new ReadableStream({ start(c) { enqueue = value => c.enqueue(new TextEncoder().encode(JSON.stringify(value) + '\n')); close = () => c.close(); } }) });
    await render(); await generate();
    mocks.auth.user = user('b'); await render();
    const count = mocks.toast.mock.calls.length;
    await settle(() => { enqueue({ type: 'progress', requestId: 'old-request', stage: 'repairing', elapsedMs: 1, callCount: 3 }); enqueue({ type: 'error', requestId: 'old-request', error: 'Old failure', code: 'FAIL' }); close(); });
    expect(container.textContent).not.toContain('old-request');
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(mocks.toast).toHaveBeenCalledTimes(count);
  });
  it('turns an interrupted stream into persistent error instead of stuck spinner', async () => {
    mocks.fetch.mockResolvedValueOnce({ ok: true, headers: new Headers({ 'Content-Type': 'application/x-ndjson' }), body: new ReadableStream({ start(controller) { controller.close(); } }) });
    await render(); await generate();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('interrupted');
    expect(button('Generate').disabled).toBe(false);
  });
});

describe('generation request', () => {
  it('sends count, mode, taste switch and history from the session batches', async () => {
    await render();
    expect(button('Generate').textContent).toContain('Generate 3 jokes');
    await generate();
    expect(bodies()[0]).toEqual({ topicHint: '', model: DEFAULT_GENERATE_MODEL, temperature: 0.8, count: 3, mode: 'original', useTasteProfile: true, recentGeneratedJokes: [] });
    await settle(() => (container.querySelector('[role="radio"][value="5"]') as HTMLButtonElement).click());
    const taste = container.querySelector('#use-taste-profile') as HTMLButtonElement;
    expect(taste.getAttribute('aria-checked')).toBe('true');
    await settle(() => taste.click());
    expect(taste.getAttribute('aria-checked')).toBe('false');
    expect(button('Generate').textContent).toContain('Generate 5 jokes');
    mocks.fetch.mockResolvedValueOnce(response(batch(2, 5, { requestedCount: 5 })));
    await generate();
    expect(bodies()[1]).toMatchObject({ count: 5, useTasteProfile: false, recentGeneratedJokes: batch(1).jokes.map(j => j.jokeText) });
    expect(bodies()[1]).not.toHaveProperty('prefilledJokes');
    expect(bodies()[1]).not.toHaveProperty('style');
  });
  it('defaults to new jokes and sends proven classics once chosen', async () => {
    await render(); await generate();
    expect(bodies()[0].mode).toBe('original');
    const classic = container.querySelector<HTMLButtonElement>('[role="radio"][value="classic"]')!;
    expect(classic.getAttribute('aria-checked')).toBe('false');
    expect(container.querySelector('[role="radiogroup"]')?.getAttribute('aria-labelledby')).toBeTruthy();
    await settle(() => classic.click());
    expect(classic.getAttribute('aria-checked')).toBe('true');
    await generate();
    expect(bodies()[1].mode).toBe('classic');
    expect(container.textContent).toContain('Proven classics · by Gemini 3.5 Flash-Lite');
  });
  it.each([
    ['a remembered catalog model', 'googleai/gemini-3.6-flash', 'googleai/gemini-3.6-flash'],
    ['an unknown stored model', 'googleai/gemini-0.1-flash', DEFAULT_GENERATE_MODEL],
    ['a legacy id that is not in the catalog', 'googleai/gemini-2.5-flash', DEFAULT_GENERATE_MODEL],
  ])('uses %s', async (_name, stored, expected) => {
    localStorage.setItem('jokehub:studio-model', stored);
    await render(); await generate();
    expect(bodies()[0].model).toBe(expected);
  });
  it('renders and generates when localStorage and sessionStorage throw', async () => {
    const getter = () => { throw new Error('blocked'); };
    const local = Object.getOwnPropertyDescriptor(window, 'localStorage'); const session = Object.getOwnPropertyDescriptor(window, 'sessionStorage');
    Object.defineProperty(window, 'localStorage', { configurable: true, get: getter });
    Object.defineProperty(window, 'sessionStorage', { configurable: true, get: getter });
    try {
      await render(); await generate();
      expect(card('batch 1 joke 0')).toBeTruthy();
      expect(bodies()[0].model).toBe(DEFAULT_GENERATE_MODEL);
    } finally {
      Object.defineProperty(window, 'localStorage', local!); Object.defineProperty(window, 'sessionStorage', session!);
    }
  });
});

describe('recent generation memory', () => {
  it('second request sends prior batch, retains latest 12 and excludes failed batch', async () => {
    await render();
    for (let n = 1; n <= 5; n++) { mocks.fetch.mockResolvedValueOnce(response(batch(n))); await generate(); }
    expect(bodies()[1].recentGeneratedJokes).toEqual(batch(1).jokes.map(j => j.jokeText));
    mocks.fetch.mockResolvedValueOnce(response({ error: 'failed' }, false)); await generate();
    mocks.fetch.mockResolvedValueOnce(response(batch(6))); await generate();
    const expected = [5, 4, 3, 2].flatMap(n => batch(n).jokes.map(j => j.jokeText));
    expect(bodies().at(-1).recentGeneratedJokes).toEqual(expected);
    expect(mocks.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer token-a');
    expect(container.querySelector('[role="status"]')).not.toBeNull();
  });
  it('keeps newest original spelling/rank while deduping normalized older history', async () => {
    await render(); await generate();
    mocks.fetch.mockResolvedValueOnce(response({ ...batch(2), jokes: [{ jokeText: 'ＢＡＴＣＨ 1 JOKE 1!!!', category: 'Work' }, ...batch(2).jokes.slice(0, 2)] }));
    await generate(); await generate();
    expect(bodies()[2].recentGeneratedJokes).toEqual(['ＢＡＴＣＨ 1 JOKE 1!!!', 'batch 2 joke 0', 'batch 2 joke 1', 'batch 1 joke 0', 'batch 1 joke 2']);
  });
  it.each([{ jokes: [], model: MODEL, requestedCount: 3 }, { jokes: [{ jokeText: 'bad' }], model: MODEL, requestedCount: 3 }, { ...batch(1), jokes: batch(1).jokes.map(j => ({ ...j, jokeText: '!!!' })) }, { ...batch(1), jokes: batch(1).jokes.map(j => ({ ...j, jokeText: 'x'.repeat(2001) })) }, { ...batch(1), jokes: batch(1).jokes.map(j => ({ ...j, category: ' ' })) }, { jokes: batch(1).jokes }, { ...batch(1), model: '' }])('rejects malformed response before cards/history: %j', async malformed => {
    await render(); mocks.fetch.mockResolvedValueOnce(response(malformed)); await generate();
    expect(container.querySelector('li[data-studio-joke]')).toBeNull();
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

describe('batches', () => {
  it('prepends batches, keeps five, collapses older ones and shows the producing model', async () => {
    await render();
    for (let n = 1; n <= 6; n++) { mocks.fetch.mockResolvedValueOnce(response(batch(n))); await generate(); }
    const toggles = [...container.querySelectorAll('button[aria-expanded][aria-controls^="batch-"]')];
    expect(toggles).toHaveLength(5);
    expect(toggles.map(t => t.getAttribute('aria-expanded'))).toEqual(['true', 'false', 'false', 'false', 'false']);
    expect(container.querySelector('li[data-studio-joke]')?.textContent).toContain('batch 6 joke 0');
    expect(container.textContent).not.toContain('batch 1 joke 0');
    expect(container.textContent).toContain('Gemini 3.5 Flash-Lite');
    await settle(() => (toggles[1] as HTMLButtonElement).click());
    expect(card('batch 5 joke 0')).toBeTruthy();
    expect(toggles[1].getAttribute('aria-expanded')).toBe('true');
  });
  it('shows a partial batch notice', async () => {
    mocks.fetch.mockResolvedValueOnce(response(batch(1, 2, { requestedCount: 5 })));
    await render(); await generate();
    expect(container.textContent).toContain('Only 2 of 5 passed the quality check');
  });
  it('restores batches for the same user after a remount but not for another user, and sign-out clears them', async () => {
    await render(); await generate();
    await settle(() => root.unmount()); root = createRoot(container); await render();
    expect(card('batch 1 joke 0')).toBeTruthy();
    expect(button('Generate')).toBeTruthy();
    await generate(); expect(bodies()[1].recentGeneratedJokes).toEqual(batch(1).jokes.map(j => j.jokeText));
    mocks.auth.user = user('b'); await render();
    expect(container.textContent).not.toContain('batch 1 joke 0');
    mocks.auth.user = null; await render(); mocks.auth.user = user('a'); await render();
    expect(container.textContent).not.toContain('batch 1 joke 0');
  });
});

describe('saving generated jokes', () => {
  it('saves two different cards from one batch, stays on the page and links each saved joke', async () => {
    mocks.add.mockResolvedValueOnce('joke-1').mockResolvedValueOnce('joke-2');
    await render(); mocks.fetch.mockResolvedValueOnce(response(batch(1, 3, { model: 'googleai/gemini-3.6-flash' })));
    await generate();
    await settle(() => button('Save', card('batch 1 joke 0')).click());
    await settle(() => button('Save', card('batch 1 joke 2')).click());
    expect(mocks.add.mock.calls.map(([data]) => data)).toEqual([
      { text: 'batch 1 joke 0', category: 'Work', source: 'AI Assistant' },
      { text: 'batch 1 joke 2', category: 'Work', source: 'AI Assistant' },
    ]);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(card('batch 1 joke 0').querySelector('a')?.getAttribute('href')).toBe('/joke/joke-1');
    expect(card('batch 1 joke 2').querySelector('a')?.getAttribute('href')).toBe('/joke/joke-2');
    expect(card('batch 1 joke 0').textContent).toContain('Saved');
    expect(card('batch 1 joke 1').textContent).not.toContain('Saved');
    const saved = mocks.toast.mock.calls.map(([t]) => t).filter(t => t.title === 'Joke saved');
    expect(saved).toHaveLength(2);
    expect(saved[0].action.props.children.props.href).toBe('/joke/joke-1');
    expect(mocks.taste.setFeedback).toHaveBeenCalledWith(mocks.auth.user, { jokeText: 'batch 1 joke 0', category: 'Work', vote: null, reason: null, saved: true, mode: 'original', model: 'googleai/gemini-3.6-flash' });
    expect(card('batch 1 joke 1')).toBeTruthy();
  });
  it('prevents double saves and keeps the card when the save fails', async () => {
    const pending = deferred<string>(); mocks.add.mockReturnValueOnce(pending.promise);
    await render(); await generate();
    const save = button('Save', card('batch 1 joke 0'));
    await settle(() => { save.click(); save.click(); });
    expect(mocks.add).toHaveBeenCalledTimes(1);
    expect(button('Saving', card('batch 1 joke 0')).disabled).toBe(true);
    await settle(() => pending.reject(new Error('write failed')));
    expect(button('Save', card('batch 1 joke 0')).disabled).toBe(false);
    expect(toastTitles()).not.toContain('Joke saved');
    expect(mocks.taste.setFeedback).not.toHaveBeenCalled();
  });
  it('keeps the save but warns when its feedback cannot be recorded', async () => {
    mocks.add.mockResolvedValueOnce('joke-1'); mocks.taste.setFeedback.mockRejectedValueOnce(new Error('server error'));
    await render(); await generate();
    await settle(() => button('Save', card('batch 1 joke 0')).click());
    expect(card('batch 1 joke 0').textContent).toContain('Saved');
    expect(toastTitles()).toContain("Couldn't save feedback");
  });
});

describe('form saves', () => {
  it('stays on the page after a manual save, keeps batches and settings, and announces once', async () => {
    mocks.add.mockResolvedValueOnce('manual-1');
    await render();
    const topic = container.querySelector('#ai-topic-hint-page') as HTMLInputElement;
    await settle(() => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!; set.call(topic, 'cats'); topic.dispatchEvent(new Event('input', { bubbles: true })); });
    await generate();
    await settle(() => button('Mock form save').click());
    expect(mocks.formResult).toHaveBeenCalledWith('resolved');
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.add).toHaveBeenCalledWith({ text: 'typed joke', category: 'Work', source: '' });
    expect(toastTitles().filter(t => t === 'Joke saved')).toHaveLength(1);
    expect(card('batch 1 joke 0')).toBeTruthy();
    expect((container.querySelector('#ai-topic-hint-page') as HTMLInputElement).value).toBe('cats');
    expect(mocks.taste.setFeedback).not.toHaveBeenCalled();
    expect(button('Back to Jokes List')).toBeTruthy();
  });
  it('a failed form save rejects so the form keeps its contents', async () => {
    mocks.add.mockRejectedValueOnce(new Error('denied'));
    await render(); await settle(() => button('Mock form save').click());
    expect(mocks.formResult).toHaveBeenCalledWith('rejected', expect.any(Error));
    expect(toastTitles()).not.toContain('Joke saved');
  });
  it('edit fills the form; saving marks the card saved and records the edited text', async () => {
    mocks.add.mockResolvedValueOnce('edited-1');
    await render(); await generate();
    await settle(() => button('Edit', card('batch 1 joke 1')).click());
    expect(container.querySelector('[data-prefill]')?.textContent).toBe('batch 1 joke 1');
    mocks.formData = { text: 'batch 1 joke 1, but better', category: 'Puns', source: 'AI Assistant' };
    await settle(() => button('Mock form save').click());
    expect(mocks.add).toHaveBeenCalledWith(mocks.formData);
    expect(card('batch 1 joke 1').textContent).toContain('Saved');
    expect(card('batch 1 joke 1').querySelector('a')?.getAttribute('href')).toBe('/joke/edited-1');
    expect(mocks.taste.setFeedback).toHaveBeenCalledWith(mocks.auth.user, { jokeText: 'batch 1 joke 1, but better', category: 'Puns', saved: true, mode: 'original', model: MODEL });
    expect(mocks.push).not.toHaveBeenCalled();
    mocks.add.mockResolvedValueOnce('manual-2'); mocks.taste.setFeedback.mockClear();
    await settle(() => button('Mock form save').click());
    expect(mocks.taste.setFeedback).not.toHaveBeenCalled();
  });
});

describe('votes and samples from cards', () => {
  const thumb = (index: number, kind: 'good' | 'bad') =>
    container.querySelectorAll<HTMLButtonElement>(`button[aria-label^="Mark as a ${kind} joke"]`)[index];
  it('records a toggleable vote per generated joke with its context through the taste service', async () => {
    await render(); await generate();
    expect(thumb(0, 'bad').getAttribute('aria-label')).toBe('Mark as a bad joke, option 1');
    expect(thumb(0, 'bad').getAttribute('aria-pressed')).toBe('false');
    await settle(() => thumb(0, 'bad').click());
    expect(thumb(0, 'bad').getAttribute('aria-pressed')).toBe('true');
    expect(mocks.taste.setFeedback).toHaveBeenLastCalledWith(mocks.auth.user, { jokeText: 'batch 1 joke 0', category: 'Work', vote: 'down', reason: null, saved: false, mode: 'original', model: DEFAULT_GENERATE_MODEL });
    await settle(() => thumb(0, 'good').click());
    expect(thumb(0, 'good').getAttribute('aria-pressed')).toBe('true');
    expect(thumb(0, 'bad').getAttribute('aria-pressed')).toBe('false');
    await settle(() => thumb(0, 'good').click());
    expect(thumb(0, 'good').getAttribute('aria-pressed')).toBe('false');
    expect(mocks.taste.setFeedback.mock.calls.map(([, input]) => input.vote)).toEqual(['down', 'up', null]);
    expect(thumb(1, 'bad').getAttribute('aria-pressed')).toBe('false');
    expect(document.getElementById(thumb(0, 'good').getAttribute('aria-describedby')!)?.textContent).toBe('batch 1 joke 0');
  });
  it('sends topic hint and request id with feedback when known', async () => {
    mocks.fetch.mockResolvedValueOnce({ ...response(batch(1)), headers: new Headers({ 'x-request-id': 'req-7' }) });
    await render();
    const topic = container.querySelector('#ai-topic-hint-page') as HTMLInputElement;
    await settle(() => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!; set.call(topic, ' cats '); topic.dispatchEvent(new Event('input', { bubbles: true })); });
    await generate();
    await settle(() => thumb(1, 'good').click());
    expect(mocks.taste.setFeedback).toHaveBeenLastCalledWith(mocks.auth.user, { jokeText: 'batch 1 joke 1', category: 'Work', vote: 'up', reason: null, saved: false, mode: 'original', model: MODEL, topicHint: 'cats', requestId: 'req-7' });
  });
  it('updates the taste summary and records a reason on Enter', async () => {
    await render(); await generate();
    await settle(() => thumb(0, 'good').click());
    expect(container.textContent).toContain('Learning from 1 like and 0 dislikes');
    const reason = card('batch 1 joke 0').querySelector('input[maxlength="200"]') as HTMLInputElement;
    expect(reason).not.toBeNull();
    expect(container.querySelector(`label[for="${reason.id}"]`)?.textContent).toContain('optional');
    await settle(() => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!; set.call(reason, 'great twist'); reason.dispatchEvent(new Event('input', { bubbles: true })); });
    await settle(() => reason.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(mocks.taste.setFeedback).toHaveBeenLastCalledWith(mocks.auth.user, { jokeText: 'batch 1 joke 0', category: 'Work', vote: 'up', reason: 'great twist', saved: false, mode: 'original', model: MODEL });
    const calls = mocks.taste.setFeedback.mock.calls.length;
    await settle(() => reason.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    expect(mocks.taste.setFeedback).toHaveBeenCalledTimes(calls);
    await settle(() => thumb(0, 'good').click());
    expect(container.textContent).toContain('Learning from 0 likes and 0 dislikes');
    expect(card('batch 1 joke 0').querySelector('input[maxlength="200"]')).toBeNull();
    await settle(() => thumb(0, 'bad').click());
    expect(container.textContent).toContain('Learning from 0 likes and 1 dislike');
  });
  it('reverts the vote and explains when saving feedback fails', async () => {
    mocks.taste.setFeedback.mockRejectedValueOnce(new Error('server error'));
    await render(); await generate();
    await settle(() => thumb(2, 'bad').click());
    expect(thumb(2, 'bad').getAttribute('aria-pressed')).toBe('false');
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Couldn't save feedback", variant: 'destructive' }));
    expect(card('batch 1 joke 2').querySelector('input[maxlength="200"]')).toBeNull();
  });
  it('a new batch starts without votes', async () => {
    await render(); await generate();
    await settle(() => thumb(0, 'bad').click());
    mocks.fetch.mockResolvedValueOnce(response(batch(2))); await generate();
    expect(thumb(0, 'bad').getAttribute('aria-pressed')).toBe('false');
    expect(card('batch 2 joke 0')).toBeTruthy();
  });
  it('adds a card as a sample', async () => {
    mocks.taste.createSample.mockResolvedValueOnce({ sample: { id: 'b'.repeat(32), text: 'batch 1 joke 0', active: true, createdAt: 'x', updatedAt: 'x' }, created: true });
    await render(); await generate();
    await settle(() => button('Add as sample', card('batch 1 joke 0')).click());
    expect(mocks.taste.createSample).toHaveBeenCalledWith(mocks.auth.user, { text: 'batch 1 joke 0' });
    const inSamples = [...card('batch 1 joke 0').querySelectorAll('[tabindex="-1"]')].find(el => el.textContent?.includes('In samples')) as HTMLElement;
    expect(inSamples).toBeTruthy();
    expect(document.activeElement).toBe(inSamples);
    expect(container.textContent).toContain('1 of 50 samples');
  });
  it('removing an item from the feedback list clears the matching card vote', async () => {
    await render(); await generate();
    await settle(() => thumb(0, 'good').click());
    await settle(() => button('Your feedback').click());
    await settle(() => named('Remove feedback').click());
    expect(mocks.taste.setFeedback).toHaveBeenLastCalledWith(mocks.auth.user, { jokeText: 'batch 1 joke 0', vote: null, saved: false });
    expect(thumb(0, 'good').getAttribute('aria-pressed')).toBe('false');
    expect(container.textContent).toContain('Learning from 0 likes and 0 dislikes');
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
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Connecting securely…');
    expect(container.textContent).not.toContain('batch 99');
    expect(mocks.toast).toHaveBeenCalledTimes(count);
    if (oldSignal) expect(oldSignal.aborted).toBe(true);
    await settle(() => current.resolve(response(batch(2))));
    expect(container.textContent).toContain('batch 2 joke 0');
    await generate(); expect(bodies().at(-1).recentGeneratedJokes).toEqual(batch(2).jokes.map(j => j.jokeText));
  });
  it('sign-out resets history, cards and form prefill; unmount invalidates pending JSON', async () => {
    await render(); await generate(); await settle(() => button('Edit', card('batch 1 joke 0')).click());
    mocks.auth.user = null; await render(); mocks.auth.user = user('a'); await render();
    expect(container.querySelector('li[data-studio-joke]')).toBeNull(); expect(container.querySelector('[data-prefill]')?.textContent).toBe('');
    const json = deferred<unknown>(); mocks.fetch.mockResolvedValueOnce({ ok: true, json: () => json.promise }); await generate();
    expect(bodies().at(-1).recentGeneratedJokes).toEqual([]);
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
it('has no buttons without an accessible name', async () => {
  await render(); await generate();
  const labelled = (el: Element) => !!el.id && !!container.querySelector(`label[for="${el.id}"]`)?.textContent?.trim();
  const unnamed = buttons().filter(el => !(el.getAttribute('aria-label') || el.textContent?.trim() || el.getAttribute('aria-labelledby') || labelled(el)));
  expect(unnamed.map(el => el.outerHTML)).toEqual([]);
});

describe('review fixes', () => {
  const thumb = (index: number, kind: 'good' | 'bad') =>
    container.querySelectorAll<HTMLButtonElement>(`button[aria-label^="Mark as a ${kind} joke"]`)[index];
  const type = (el: HTMLInputElement, value: string) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); };

  it('disables Edit while a form save is in flight so the link cannot move to another card', async () => {
    const pending = deferred<string>(); mocks.add.mockReturnValueOnce(pending.promise);
    await render(); await generate();
    await settle(() => button('Edit', card('batch 1 joke 0')).click());
    mocks.formData = { text: 'batch 1 joke 0 edited', category: 'Work', source: 'AI Assistant' };
    await settle(() => button('Mock form save').click());
    expect(button('Edit', card('batch 1 joke 1')).disabled).toBe(true);
    await settle(() => button('Edit', card('batch 1 joke 1')).click());
    expect(container.querySelector('[data-prefill]')?.textContent).toBe('batch 1 joke 0');
    await settle(() => pending.resolve('saved-a'));
    expect(card('batch 1 joke 0').textContent).toContain('Saved');
    expect(button('Edit', card('batch 1 joke 1')).disabled).toBe(false);
    mocks.add.mockResolvedValueOnce('manual'); mocks.taste.setFeedback.mockClear();
    mocks.formData = { text: 'unrelated', category: 'Work', source: '' };
    await settle(() => button('Mock form save').click());
    expect(card('batch 1 joke 1').textContent).not.toContain('Saved');
    expect(mocks.taste.setFeedback).not.toHaveBeenCalled();
  });

  it('links a card only once the form accepts its prefill', async () => {
    mocks.acceptPrefill = false;
    await render(); await generate();
    await settle(() => button('Edit', card('batch 1 joke 0')).click());
    mocks.add.mockResolvedValueOnce('manual');
    await settle(() => button('Mock form save').click());
    expect(card('batch 1 joke 0').textContent).not.toContain('Saved');
    expect(mocks.taste.setFeedback).not.toHaveBeenCalled();
  });

  it('marks the linked card as saving during a form save and restores it on failure', async () => {
    const pending = deferred<string>(); mocks.add.mockReturnValueOnce(pending.promise);
    await render(); await generate();
    await settle(() => button('Edit', card('batch 1 joke 2')).click());
    await settle(() => button('Mock form save').click());
    expect(button('Saving', card('batch 1 joke 2')).disabled).toBe(true);
    await settle(() => pending.reject(new Error('write failed')));
    expect(button('Save', card('batch 1 joke 2')).disabled).toBe(false);
    expect(mocks.add).toHaveBeenCalledTimes(1);
  });

  it('moves focus to the View link after a card save', async () => {
    mocks.add.mockResolvedValueOnce('joke-1');
    await render(); await generate();
    const save = button('Save', card('batch 1 joke 0'));
    save.focus();
    await settle(() => save.click());
    expect(document.activeElement?.getAttribute('href')).toBe('/joke/joke-1');
  });

  it('keeps collapsed batches mounted and leaves the batch holding focus open', async () => {
    await render(); await generate();
    await settle(() => thumb(0, 'good').click());
    const reason = card('batch 1 joke 0').querySelector('input[maxlength="200"]') as HTMLInputElement;
    reason.focus(); await settle(() => type(reason, 'draft in progress'));
    mocks.fetch.mockResolvedValueOnce(response(batch(2))); await generate();
    const toggles = [...container.querySelectorAll('button[aria-expanded][aria-controls^="batch-"]')];
    expect(toggles.map(t => t.getAttribute('aria-expanded'))).toEqual(['true', 'true']);
    expect(reason.isConnected).toBe(true);
    expect(reason.value).toBe('draft in progress');
    (document.activeElement as HTMLElement).blur();
    mocks.fetch.mockResolvedValueOnce(response(batch(3))); await generate();
    const after = [...container.querySelectorAll('button[aria-expanded][aria-controls^="batch-"]')];
    expect(after.map(t => t.getAttribute('aria-expanded'))).toEqual(['true', 'false', 'false']);
    const collapsed = document.getElementById(after[2].getAttribute('aria-controls')!)!;
    expect(collapsed.hidden).toBe(true);
    expect(collapsed.querySelector('li[data-studio-joke]')).not.toBeNull();
  });

  it('serializes feedback writes per card and sends the full state each time', async () => {
    await render(); await generate();
    await settle(() => thumb(0, 'good').click());
    const reasonWrite = deferred<null>();
    mocks.taste.setFeedback.mockImplementationOnce(() => reasonWrite.promise);
    const reason = card('batch 1 joke 0').querySelector('input[maxlength="200"]') as HTMLInputElement;
    await settle(() => type(reason, 'nice'));
    await settle(() => reason.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    await settle(() => thumb(0, 'bad').click());
    expect(mocks.taste.setFeedback).toHaveBeenCalledTimes(2);
    await settle(() => reasonWrite.resolve(null));
    expect(mocks.taste.setFeedback).toHaveBeenCalledTimes(3);
    expect(mocks.taste.setFeedback.mock.calls.map(([, input]) => [input.vote, input.reason, input.saved])).toEqual([
      ['up', null, false], ['up', 'nice', false], ['down', null, false],
    ]);
    expect(thumb(0, 'bad').getAttribute('aria-pressed')).toBe('true');
  });

  it('a vote on a saved card keeps saved true', async () => {
    mocks.add.mockResolvedValueOnce('joke-1');
    await render(); await generate();
    await settle(() => button('Save', card('batch 1 joke 0')).click());
    await settle(() => thumb(0, 'good').click());
    expect(mocks.taste.setFeedback).toHaveBeenLastCalledWith(mocks.auth.user, { jokeText: 'batch 1 joke 0', category: 'Work', vote: 'up', reason: null, saved: true, mode: 'original', model: MODEL });
  });
});
