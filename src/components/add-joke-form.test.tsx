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
const applied = vi.fn();
function render(onAddJoke: (data: unknown) => Promise<void>, prefill: JokeFormPrefill | null = null) {
  return settle(() => root.render(<AddJokeForm onAddJoke={onAddJoke} prefill={prefill} onPrefillApplied={applied} />));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); applied.mockReset();
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

  it('ignores a prefill that arrives while a save is in flight', async () => {
    let finish!: () => void;
    const onAddJoke = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const first = { key: 'k1', text: 'Card A', category: 'Work', source: 'AI Assistant' };
    await render(onAddJoke, first);
    expect(applied).toHaveBeenLastCalledWith('k1');
    await submit();
    await render(onAddJoke, { key: 'k2', text: 'Card B', category: 'Work', source: 'AI Assistant' });
    expect(applied).not.toHaveBeenCalledWith('k2');
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    await settle(() => finish());
    expect(text().value).toBe('');
    expect(applied).not.toHaveBeenCalledWith('k2');
  });

  it('asks before replacing edited text; Keep editing changes nothing and returns focus', async () => {
    const editButton = document.createElement('button'); editButton.textContent = 'Edit'; document.body.append(editButton);
    try {
      await render(vi.fn(async () => {}), { key: 'k1', text: 'Card A', category: 'Work', source: 'AI Assistant' });
      await settle(() => typeInto(text(), 'Card A, improved'));
      editButton.focus();
      await render(vi.fn(async () => {}), { key: 'k2', text: 'Card B', category: 'Puns', source: 'AI Assistant' });
      const dialog = document.querySelector('[role="alertdialog"]')!;
      expect(dialog.textContent).toContain("Replace the joke you're editing?");
      expect(text().value).toBe('Card A, improved');
      const keep = [...dialog.querySelectorAll('button')].find(el => el.textContent === 'Keep editing')!;
      await settle(() => keep.click());
      await settle(); // Radix restores focus in a timeout after the dialog unmounts.
      expect(document.querySelector('[role="alertdialog"]')).toBeNull();
      expect(text().value).toBe('Card A, improved');
      expect(category().value).toBe('Work');
      expect(applied).not.toHaveBeenCalledWith('k2');
      expect(document.activeElement).toBe(editButton);

      await render(vi.fn(async () => {}), { key: 'k3', text: 'Card C', category: 'Puns', source: 'AI Assistant' });
      const replace = [...document.querySelectorAll('[role="alertdialog"] button')].find(el => el.textContent === 'Replace') as HTMLButtonElement;
      await settle(() => replace.click());
      await settle();
      expect(text().value).toBe('Card C');
      expect(category().value).toBe('Puns');
      expect(applied).toHaveBeenLastCalledWith('k3');
      expect(document.activeElement).toBe(text());
    } finally {
      editButton.remove();
    }
  });

  it('replaces an untouched prefill without asking', async () => {
    await render(vi.fn(async () => {}), { key: 'k1', text: 'Card A', category: 'Work', source: 'AI Assistant' });
    await render(vi.fn(async () => {}), { key: 'k2', text: 'Card B', category: 'Work', source: 'AI Assistant' });
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(text().value).toBe('Card B');
    expect(applied).toHaveBeenLastCalledWith('k2');
  });
});
