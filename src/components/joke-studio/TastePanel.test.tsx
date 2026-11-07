import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  toast: vi.fn(), removed: vi.fn(), reset: vi.fn(),
  taste: { listFeedback: vi.fn(), setFeedback: vi.fn(), clearFeedback: vi.fn() },
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/services/tasteService', () => mocks.taste);

import TastePanel from './TastePanel';
import { useGenerationFeedback } from '@/hooks/useGenerationFeedback';
import type { GenerationFeedback } from '@/lib/tasteProfile';

const user = { getIdToken: async () => 'token' };
const record = (text: string, extra: Partial<GenerationFeedback>): GenerationFeedback => ({
  id: Array.from(text).map(c => c.charCodeAt(0).toString(16)).join('').padEnd(32, '0').slice(0, 32),
  jokeText: text, vote: null, saved: false, updatedAt: 'x', ...extra,
});
const liked = record('Liked joke', { vote: 'up', reason: 'clever' });
const disliked = record('Disliked joke', { vote: 'down' });
const saved = record('Saved joke', { saved: true });

function Harness() { return <TastePanel feedback={useGenerationFeedback(user)} onRemoved={mocks.removed} onReset={mocks.reset} />; }

let container: HTMLDivElement; let root: Root;
async function settle(fn: () => void = () => {}) { await act(async () => { fn(); await new Promise(resolve => setTimeout(resolve, 0)); }); }
function button(text: string, scope: ParentNode = document) { const found = [...scope.querySelectorAll('button')].find(el => el.textContent?.trim().startsWith(text)); if (!found) throw new Error(`Missing button ${text}`); return found as HTMLButtonElement; }
function items() { return [...container.querySelectorAll('li[data-feedback]')]; }

beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.taste.listFeedback.mockResolvedValue({ feedback: [liked, disliked, saved], counts: { liked: 2, disliked: 1 } });
  mocks.taste.setFeedback.mockResolvedValue(null);
  mocks.taste.clearFeedback.mockResolvedValue(3);
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await settle(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe('taste panel', () => {
  it('summarizes counts and expands the feedback list', async () => {
    await settle(() => root.render(<Harness />));
    expect(container.textContent).toContain('Learning from 2 likes and 1 dislike.');
    const toggle = button('Your feedback', container);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(items()).toHaveLength(0);
    await settle(() => toggle.click());
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(items().map(item => item.textContent)).toEqual([
      expect.stringContaining('Liked'), expect.stringContaining('Disliked'), expect.stringContaining('Saved'),
    ]);
    expect(items()[0].textContent).toContain('“clever”');
  });

  it('removes one item by clearing its vote and saved flag', async () => {
    await settle(() => root.render(<Harness />));
    await settle(() => button('Your feedback', container).click());
    const remove = items()[0].querySelector('button[aria-label="Remove feedback"]') as HTMLButtonElement;
    expect(document.getElementById(remove.getAttribute('aria-describedby')!)?.textContent).toBe('Liked joke');
    await settle(() => remove.click());
    expect(mocks.taste.setFeedback).toHaveBeenCalledWith(user, { jokeText: 'Liked joke', vote: null, saved: false });
    expect(items()).toHaveLength(2);
    expect(container.textContent).toContain('Learning from 1 like and 1 dislike.');
    expect(mocks.removed).toHaveBeenCalledWith(liked);
  });

  it('keeps an item and warns when removal fails', async () => {
    mocks.taste.setFeedback.mockRejectedValueOnce(new Error('server error'));
    await settle(() => root.render(<Harness />));
    await settle(() => button('Your feedback', container).click());
    await settle(() => (items()[1].querySelector('button[aria-label="Remove feedback"]') as HTMLButtonElement).click());
    expect(items()).toHaveLength(3);
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Couldn't remove feedback" }));
    expect(mocks.removed).not.toHaveBeenCalled();
  });

  it('resets all feedback only after confirming', async () => {
    await settle(() => root.render(<Harness />));
    await settle(() => button('Reset feedback', container).click());
    expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain('Reset all feedback?');
    await settle(() => button('Keep feedback').click());
    expect(mocks.taste.clearFeedback).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    await settle(() => button('Reset feedback', container).click());
    const dialog = document.querySelector('[role="alertdialog"]')!;
    await settle(() => button('Reset feedback', dialog).click());
    expect(mocks.taste.clearFeedback).toHaveBeenCalledWith(user);
    expect(container.textContent).toContain('Learning from 0 likes and 0 dislikes.');
    expect(mocks.reset).toHaveBeenCalledTimes(1);
  });

  it('shows a retry when feedback fails to load', async () => {
    mocks.taste.listFeedback.mockRejectedValueOnce(new Error('down'));
    await settle(() => root.render(<Harness />));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Couldn't load your feedback");
    expect(button('Reset feedback', container).disabled).toBe(true);
    await settle(() => button('Retry loading feedback', container).click());
    expect(container.textContent).toContain('Learning from 2 likes and 1 dislike.');
  });
});
