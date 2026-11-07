import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'u1' } }) }));
vi.mock('@/contexts/JokeContext', () => ({ useJokes: () => ({ loadingCategories: false }) }));
vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
// Only the category data subscription is replaced; the form, validation and fields are real.
vi.mock('@/components/CategoryCombobox', () => ({
  CategoryCombobox: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <input aria-label="Category" data-category value={value} onChange={event => onChange(event.target.value)} />
  ),
}));

import AddJokeForm, { type JokeFormPrefill } from './add-joke-form';

let container: HTMLDivElement; let root: Root;
async function settle(fn: () => void = () => {}) { await act(async () => { fn(); await new Promise(resolve => setTimeout(resolve, 0)); }); }
function typeInto(el: HTMLTextAreaElement | HTMLInputElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
const text = () => container.querySelector('textarea')!;
const category = () => container.querySelector('[data-category]') as HTMLInputElement;
const source = () => container.querySelector('input[placeholder="e.g., A friend, a book"]') as HTMLInputElement;
async function submit() { await settle(() => container.querySelector('form')!.requestSubmit()); }
function render(onAddJoke: (data: unknown) => Promise<void>, prefill: JokeFormPrefill | null = null) {
  return settle(() => root.render(<AddJokeForm onAddJoke={onAddJoke} prefill={prefill} />));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await settle(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('AddJokeForm', () => {
  it('resets and returns focus to the joke text after a successful save', async () => {
    const onAddJoke = vi.fn(async () => {});
    await render(onAddJoke);
    await settle(() => { typeInto(text(), 'A typed joke'); typeInto(category(), 'Work'); });
    await submit();
    expect(onAddJoke).toHaveBeenCalledWith({ text: 'A typed joke', category: 'Work', source: '' });
    expect(text().value).toBe('');
    expect(category().value).toBe('');
    expect(document.activeElement).toBe(text());
  });

  it('keeps every field when the save fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await render(async () => { throw new Error('write failed'); });
    await settle(() => { typeInto(text(), 'Keep me'); typeInto(category(), 'Work'); typeInto(source(), 'Me'); });
    await submit();
    expect(text().value).toBe('Keep me');
    expect(category().value).toBe('Work');
    expect(source().value).toBe('Me');
  });

  it('loads a prefill, keeps user edits across re-renders, reloads on a new key and saves the edited text', async () => {
    const onAddJoke = vi.fn(async () => {});
    const first = { key: 'k1', text: 'Generated joke', category: 'Puns', source: 'AI Assistant' };
    await render(onAddJoke, first);
    expect(text().value).toBe('Generated joke');
    expect(category().value).toBe('Puns');
    expect(source().value).toBe('AI Assistant');
    expect(document.activeElement).toBe(text());
    await settle(() => typeInto(text(), 'Generated joke, edited'));
    await render(onAddJoke, { ...first });
    expect(text().value).toBe('Generated joke, edited');
    await submit();
    expect(onAddJoke).toHaveBeenCalledWith({ text: 'Generated joke, edited', category: 'Puns', source: 'AI Assistant' });
    expect(text().value).toBe('');
    expect(source().value).toBe('');
    await render(onAddJoke, { ...first, key: 'k2' });
    expect(text().value).toBe('Generated joke');
  });
});
