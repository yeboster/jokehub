import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  toast: vi.fn(), fiveStar: vi.fn(),
  taste: { listSamples: vi.fn(), createSample: vi.fn(), updateSample: vi.fn(), deleteSample: vi.fn() },
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/services/tasteService', () => mocks.taste);
vi.mock('@/services/jokeService', () => ({ fetchUserFiveStarJokes: mocks.fiveStar }));

import SamplesPanel from './SamplesPanel';
import { useJokeSamples } from '@/hooks/useJokeSamples';
import type { JokeSample } from '@/lib/tasteProfile';

const user = { uid: 'u1', getIdToken: async () => 'token' };
const idFor = (text: string) => Array.from(text).map(c => c.charCodeAt(0).toString(16)).join('').padEnd(32, '0').slice(0, 32);
const sample = (text: string, extra: Partial<JokeSample> = {}): JokeSample => ({ id: idFor(text), text, active: true, createdAt: 'x', updatedAt: 'x', ...extra });

function Harness() { return <SamplesPanel samples={useJokeSamples(user)} />; }

let container: HTMLDivElement; let root: Root;
async function settle(fn: () => void = () => {}) { await act(async () => { fn(); }); }
function button(text: string) { const found = [...container.querySelectorAll('button')].find(el => el.textContent?.includes(text)); if (!found) throw new Error(`Missing button ${text}`); return found as HTMLButtonElement; }
function typeInto(el: HTMLTextAreaElement | HTMLInputElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
function items() { return [...container.querySelectorAll('li[data-sample]')]; }
function toastTitles() { return mocks.toast.mock.calls.map(([t]) => t.title); }
async function addTyped(text: string, note = '') {
  await settle(() => typeInto(container.querySelector('textarea')!, text));
  if (note) await settle(() => typeInto(container.querySelector('form input') as HTMLInputElement, note));
  await settle(() => button('Add sample').click());
}

beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.taste.listSamples.mockResolvedValue([sample('Existing joke', { note: 'classic' })]);
  mocks.taste.createSample.mockImplementation(async (_auth, input) => ({ sample: sample(input.text, input.note ? { note: input.note } : {}), created: true }));
  mocks.taste.updateSample.mockImplementation(async (_auth, input) => sample('Existing joke', { note: 'classic', active: input.active }));
  mocks.taste.deleteSample.mockResolvedValue(true);
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await settle(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe('samples panel', () => {
  it('lists samples with note, an active switch and a delete button described by the text', async () => {
    await settle(() => root.render(<Harness />));
    expect(items()).toHaveLength(1);
    expect(items()[0].textContent).toContain('Note: classic');
    const toggle = items()[0].querySelector('[role="switch"]')!;
    expect(container.querySelector(`label[for="${toggle.id}"]`)?.textContent).toBe('Use this sample');
    expect(document.getElementById(toggle.getAttribute('aria-describedby')!)?.textContent).toBe('Existing joke');
    expect(container.textContent).toContain('1 of 50 samples');
  });

  it('adds a typed sample with a note and reports duplicates', async () => {
    await settle(() => root.render(<Harness />));
    await addTyped('A brand new joke', 'tight');
    expect(mocks.taste.createSample).toHaveBeenCalledWith(user, { text: 'A brand new joke', note: 'tight' });
    expect(items()).toHaveLength(2);
    expect(container.querySelector('textarea')!.value).toBe('');
    mocks.taste.createSample.mockResolvedValueOnce({ sample: sample('Existing joke'), created: false });
    await addTyped('existing joke!');
    expect(mocks.toast).toHaveBeenLastCalledWith(expect.objectContaining({ description: 'Already in your samples.' }));
    expect(items()).toHaveLength(2);
  });

  it('blocks adding at the limit and handles a server limit error', async () => {
    mocks.taste.listSamples.mockResolvedValue(Array.from({ length: 50 }, (_, i) => sample(`Joke number ${i}`)));
    await settle(() => root.render(<Harness />));
    expect(button('Add sample').disabled).toBe(true);
    expect(button('Import my 5-star jokes').disabled).toBe(true);
    expect(container.textContent).toContain('reached the 50-sample limit');
    await settle(() => root.unmount()); root = createRoot(container);
    mocks.taste.listSamples.mockResolvedValue([]);
    mocks.taste.createSample.mockRejectedValueOnce(Object.assign(new Error('Sample limit reached'), { code: 'SAMPLE_LIMIT' }));
    await settle(() => root.render(<Harness />));
    await addTyped('One more joke');
    expect(toastTitles()).toContain('Sample limit reached');
    expect(container.querySelector('textarea')!.value).toBe('One more joke');
  });

  it('toggles a sample active and reverts when the update fails', async () => {
    await settle(() => root.render(<Harness />));
    const toggle = () => items()[0].querySelector('[role="switch"]') as HTMLButtonElement;
    await settle(() => toggle().click());
    expect(mocks.taste.updateSample).toHaveBeenCalledWith(user, { id: idFor('Existing joke'), active: false });
    expect(toggle().getAttribute('aria-checked')).toBe('false');
    mocks.taste.updateSample.mockRejectedValueOnce(new Error('server error'));
    await settle(() => toggle().click());
    expect(toggle().getAttribute('aria-checked')).toBe('false');
    expect(toastTitles()).toContain("Couldn't update sample");
  });

  it('deletes a sample', async () => {
    await settle(() => root.render(<Harness />));
    await settle(() => button('Delete').click());
    expect(mocks.taste.deleteSample).toHaveBeenCalledWith(user, idFor('Existing joke'));
    expect(items()).toHaveLength(0);
    expect(container.textContent).toContain('No samples yet');
  });

  it('imports 5-star jokes, reporting added and skipped, and stops at the cap', async () => {
    mocks.fiveStar.mockResolvedValueOnce(['Existing joke', 'Fresh one', '!!!', 'Fresh two']);
    mocks.taste.createSample.mockImplementation(async (_auth, input) => ({ sample: sample(input.text), created: input.text !== 'Existing joke' }));
    await settle(() => root.render(<Harness />));
    await settle(() => button('Import my 5-star jokes').click());
    expect(mocks.fiveStar).toHaveBeenCalledWith('u1');
    expect(mocks.taste.createSample.mock.calls.map(([, input]) => input.text)).toEqual(['Existing joke', 'Fresh one', 'Fresh two']);
    expect(mocks.toast).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Import finished', description: 'Added 2, skipped 1 already in your samples.' }));
    expect(items()).toHaveLength(3);

    await settle(() => root.unmount()); root = createRoot(container); mocks.taste.createSample.mockClear();
    mocks.taste.listSamples.mockResolvedValue(Array.from({ length: 49 }, (_, i) => sample(`Joke number ${i}`)));
    mocks.taste.createSample.mockImplementation(async (_auth, input) => ({ sample: sample(input.text), created: true }));
    mocks.fiveStar.mockResolvedValueOnce(['Fresh one', 'Fresh two', 'Fresh three']);
    await settle(() => root.render(<Harness />));
    await settle(() => button('Import my 5-star jokes').click());
    expect(mocks.taste.createSample).toHaveBeenCalledTimes(1);
    expect(mocks.toast).toHaveBeenLastCalledWith(expect.objectContaining({ description: 'Added 1, skipped 0 already in your samples. Stopped at the 50-sample limit.' }));
  });

  it('says so when there are no 5-star jokes, and shows a retry when samples fail to load', async () => {
    mocks.fiveStar.mockResolvedValueOnce([]);
    await settle(() => root.render(<Harness />));
    await settle(() => button('Import my 5-star jokes').click());
    expect(toastTitles()).toContain('No 5-star jokes yet');
    await settle(() => root.unmount()); root = createRoot(container);
    mocks.taste.listSamples.mockRejectedValueOnce(new Error('down'));
    await settle(() => root.render(<Harness />));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Couldn't load your samples");
    await settle(() => button('Retry loading samples').click());
    expect(items()).toHaveLength(1);
  });
});
