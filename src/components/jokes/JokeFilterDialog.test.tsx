import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import JokeFilterDialog from './JokeFilterDialog';
import type { FilterParams } from '@/services/jokeService';
import { DEFAULT_FILTERS } from '@/lib/jokeFilters';
import { ANY_RATING, ratingBucketLabel } from '@/lib/ratingBuckets';

const fixtures = vi.hoisted(() => ({
  categoryNames: ['Banana', 'Alpha', 'Cabaret', 'Space Puns'],
  loadingCategories: false,
  user: { uid: 'test-user' } as { uid: string } | null,
}));

// Only data subscriptions are mocked; dialog, popover, cmdk and radio primitives are real.
vi.mock('@/hooks/useUserCategories', () => ({ useUserCategories: () => fixtures }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: fixtures.user }) }));

let root: Root;
let container: HTMLDivElement;
let value: FilterParams;
const onApply = vi.fn();

async function settle(action: () => void) {
  await act(async () => {
    action();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function button(text: string): HTMLButtonElement {
  const found = [...document.querySelectorAll('button')].find((node) => node.textContent?.trim() === text);
  expect(found, `button ${text}`).toBeDefined();
  return found!;
}

function trigger(): HTMLButtonElement {
  return container.querySelector('button')!;
}

async function render(nextValue = value) {
  value = nextValue;
  await settle(() => root.render(<JokeFilterDialog value={value} onApply={onApply} />));
}

async function open() {
  await settle(() => trigger().click());
}

async function openCategories() {
  await settle(() => document.querySelector<HTMLButtonElement>('#modal-category-filter')!.click());
}

async function search(query: string) {
  const input = document.querySelector<HTMLInputElement>('[cmdk-input]')!;
  await settle(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, query);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function categories() {
  return [...document.querySelectorAll('[cmdk-item]')]
    .filter((node) => !node.closest('[hidden]') && (node as HTMLElement).style.display !== 'none')
    .map((node) => node.textContent);
}

function activeValue(): FilterParams {
  return {
    selectedCategories: ['Banana'],
    filterFunnyRate: 4,
    usageStatus: 'used',
    search: 'keep this search',
    scope: 'user',
    limit: 17,
  };
}

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  // jsdom has no layout/scroll API; cmdk calls this when moving its active item.
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  fixtures.categoryNames = ['Banana', 'Alpha', 'Cabaret', 'Space Puns'];
  fixtures.loadingCategories = false;
  fixtures.user = { uid: 'test-user' };
  onApply.mockReset();
  value = activeValue();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await render();
});

afterEach(async () => {
  await settle(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  vi.unstubAllGlobals();
});

describe('JokeFilterDialog draft reset', () => {
  it('clears only dialog-owned fields and commits only on Apply', async () => {
    await open();
    await settle(() => button('Clear filters').click());
    expect(document.querySelector('[aria-label="Remove category Banana"]')).toBeNull();
    expect(document.querySelector('#modal-funny-rate-filter')?.textContent).toBe(ratingBucketLabel(ANY_RATING));
    expect(document.querySelector('#usage-all')?.getAttribute('aria-checked')).toBe('true');
    expect(onApply).not.toHaveBeenCalled();
    expect(value).toEqual(activeValue());
    await settle(() => button('Apply Filters').click());
    expect(onApply).toHaveBeenCalledExactlyOnceWith({
      ...activeValue(), selectedCategories: [], filterFunnyRate: ANY_RATING, usageStatus: 'all',
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it.each(['Cancel', 'Close', 'Escape'])('discards cleared draft on %s and reseeds from latest value', async (dismiss) => {
    await open();
    await settle(() => button('Clear filters').click());
    await settle(() => {
      if (dismiss === 'Escape') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      else button(dismiss).click();
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(onApply).not.toHaveBeenCalled();
    const latest: FilterParams = { ...activeValue(), selectedCategories: ['Alpha'], filterFunnyRate: 2, usageStatus: 'unused' };
    await render(latest);
    await open();
    expect(document.querySelector('[aria-label="Remove category Alpha"]')).not.toBeNull();
    expect(document.querySelector('#modal-funny-rate-filter')?.textContent).toBe(ratingBucketLabel(2));
    expect(document.querySelector('#usage-unused')?.getAttribute('aria-checked')).toBe('true');
    await settle(() => button('Apply Filters').click());
    expect(onApply).toHaveBeenCalledExactlyOnceWith(latest);
  });
});

describe('JokeFilterDialog category search', () => {
  it('matches trimmed case-insensitive substrings', async () => {
    await open();
    await openCategories();
    await search('  pUn  ');
    expect(categories()).toEqual(['Space Puns']);
  });

  it('shows every category for whitespace-only queries', async () => {
    await open();
    await openCategories();
    await search('   ');
    expect(categories()).toEqual(fixtures.categoryNames);
  });

  it('uses explicit substring matching, not fuzzy matching, and keeps source order', async () => {
    await open();
    await openCategories();
    await search('a');
    expect(categories()).toEqual(fixtures.categoryNames);
    await search('bn');
    expect(categories()).toEqual([]);
    expect(document.querySelector('[cmdk-empty]')?.textContent).toBe('No categories found.');
  });

  it('preserves multi-select, removal, and keyboard selection without committing draft', async () => {
    await open();
    await openCategories();
    await search('alpha');
    await settle(() => document.querySelector('[cmdk-input]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(document.querySelector('[aria-label="Remove category Alpha"]')).not.toBeNull();
    await search('cab');
    await settle(() => document.querySelector<HTMLElement>('[cmdk-item]')!.click());
    await settle(() => document.querySelector<HTMLButtonElement>('[aria-label="Remove category Banana"]')!.click());
    expect(onApply).not.toHaveBeenCalled();
    // Escape closes only nested popover; dialog stays open.
    await settle(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    await settle(() => button('Apply Filters').click());
    expect(onApply).toHaveBeenCalledExactlyOnceWith({ ...activeValue(), selectedCategories: ['Alpha', 'Cabaret'] });
  });
});

describe('JokeFilterDialog category lifecycle', () => {
  it('retains selections while subscription loads and disables category picker', async () => {
    fixtures.categoryNames = [];
    fixtures.loadingCategories = true;
    await render();
    await open();
    expect(document.querySelector<HTMLButtonElement>('#modal-category-filter')?.disabled).toBe(true);
    await settle(() => button('Apply Filters').click());
    expect(onApply).toHaveBeenCalledExactlyOnceWith(activeValue());
  });

  it('prunes stale selections using latest category snapshot on Apply', async () => {
    await open();
    fixtures.categoryNames = ['Alpha'];
    await render();
    expect(document.querySelector('[aria-label="Remove category Banana"]')).not.toBeNull();
    await settle(() => button('Apply Filters').click());
    expect(onApply).toHaveBeenCalledExactlyOnceWith({ ...activeValue(), selectedCategories: [] });
  });

  it('hides empty loaded category picker and signed-out usage group', async () => {
    fixtures.categoryNames = [];
    fixtures.user = null;
    await render();
    await open();
    expect(document.querySelector('#modal-category-filter')).toBeNull();
    expect(document.querySelector('[role="radiogroup"]')).toBeNull();
  });
});

describe('JokeFilterDialog accessibility', () => {
  it('names category search through cmdk generated label reference', async () => {
    await open();
    await openCategories();
    const input = document.querySelector('[cmdk-input]')!;
    const labelId = input.getAttribute('aria-labelledby');
    expect(labelId).toBeTruthy();
    // cmdk's aria-labelledby takes precedence over the input's aria-label.
    expect(document.getElementById(labelId!)?.textContent).toBe('Search categories');
  });

  it('names usage radio group from visible label', async () => {
    await open();
    const group = document.querySelector('[role="radiogroup"]')!;
    const labelId = group.getAttribute('aria-labelledby');
    expect(labelId).toBeTruthy();
    expect(document.getElementById(labelId!)?.textContent).toBe('Usage Status');
  });

  it('exposes applied active state in trigger name, never draft state', async () => {
    expect(trigger().textContent).toMatch(/Filters.*active/i);
    await open();
    await settle(() => button('Clear filters').click());
    expect(trigger().textContent).toMatch(/Filters.*active/i);
    await settle(() => button('Cancel').click());
    await render({ ...DEFAULT_FILTERS });
    expect(trigger().textContent?.trim()).toBe('Filters');
  });

  it('preserves bounded scroll container and primitive close-focus return', async () => {
    await open();
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog.classList.contains('max-h-[calc(100dvh-2rem)]')).toBe(true);
    const scrollContainer = dialog.firstElementChild!;
    expect(scrollContainer.classList.contains('min-h-0')).toBe(true);
    expect(scrollContainer.classList.contains('overflow-y-auto')).toBe(true);
    expect(scrollContainer.contains(button('Apply Filters'))).toBe(true);
    expect(scrollContainer.contains(button('Close'))).toBe(false);
    await settle(() => button('Close').click());
    // FocusScope schedules focus restoration after its unmount effect.
    await settle(() => {});
    expect(document.activeElement).toBe(trigger());
  });
});
