import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import StarRating from './StarRating';

let container: HTMLDivElement;
let root: Root;

async function settle(action: () => void) {
  await act(async () => { action(); });
}

async function render(props: React.ComponentProps<typeof StarRating>) {
  await settle(() => root.render(<StarRating {...props} />));
}

function glyphs() {
  return [...container.querySelectorAll<HTMLElement>('span[aria-hidden="true"]')];
}

function fillWidths() {
  return glyphs().map((glyph) => (glyph.querySelector('span') as HTMLElement | null)?.style.width ?? '0%');
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await settle(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('StarRating fractional glyph rendering', () => {
  it.each([3.1, 3.5, 3.9])('keeps full-sized fill glyph inside fractional clip for %s at each size', async (rating) => {
    for (const size of [16, 20, 40]) {
      await render({ rating, size, readOnly: true });
      const fourth = glyphs()[3];
      const clip = fourth.querySelector('span')!;
      const fill = clip.querySelector('svg')!;
      const outline = fourth.querySelector('svg')!;
      expect(Number.parseFloat(clip.style.width)).toBeCloseTo((rating - 3) * 100);
      if (rating === 3.5) expect(clip.style.width).toBe('50%');
      for (const svg of [outline, fill]) {
        expect(svg.getAttribute('width')).toBe(String(size));
        expect(svg.getAttribute('height')).toBe(String(size));
      }
      // jsdom cannot prove layout; computed nonshrinking invariant protects
      // the full glyph from collapsing to its fractional clip's width.
      expect(getComputedStyle(fill).flexShrink).toBe('0');
      expect(container.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe(`${rating} out of 5 stars`);
      expect(container.querySelector('button')).toBeNull();
    }
  });

  it('preserves empty and full stars, labels, and custom size', async () => {
    await render({ rating: 0, size: 32, readOnly: true });
    expect(fillWidths()).toEqual(['0%', '0%', '0%', '0%', '0%']);
    expect(container.querySelectorAll('svg')).toHaveLength(5);
    await render({ rating: 5, size: 32, readOnly: true, label: 'Community rating: five stars' });
    expect(fillWidths()).toEqual(['100%', '100%', '100%', '100%', '100%']);
    expect(container.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Community rating: five stars');
    for (const svg of container.querySelectorAll('svg')) {
      expect(svg.getAttribute('width')).toBe('32');
      expect(svg.getAttribute('height')).toBe('32');
    }
  });

  it('preserves interactive preview, click, keyboard rating, and roving focus', async () => {
    const onRatingChange = vi.fn();
    await render({ rating: 2, size: 28, onRatingChange, label: 'Your rating', describedBy: 'rating-hint' });
    const radios = [...container.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    expect(radios.map((radio) => radio.tabIndex)).toEqual([-1, 0, -1, -1, -1]);
    expect(radios[1].getAttribute('aria-checked')).toBe('true');
    expect(container.querySelector('[role="radiogroup"]')?.getAttribute('aria-label')).toBe('Your rating');
    expect(container.querySelector('[role="radiogroup"]')?.getAttribute('aria-describedby')).toBe('rating-hint');
    await settle(() => radios[3].dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
    expect(fillWidths()).toEqual(['100%', '100%', '100%', '100%', '0%']);
    expect(onRatingChange).not.toHaveBeenCalled();
    await settle(() => radios[3].dispatchEvent(new MouseEvent('mouseout', { bubbles: true })));
    expect(fillWidths()).toEqual(['100%', '100%', '0%', '0%', '0%']);
    await settle(() => radios[3].click());
    expect(onRatingChange).toHaveBeenLastCalledWith(4);
    await settle(() => radios[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    expect(onRatingChange).toHaveBeenLastCalledWith(3);
    expect(document.activeElement).toBe(radios[2]);
    expect(fillWidths()).toEqual(['100%', '100%', '100%', '0%', '0%']);
    await settle(() => radios[2].blur());
    expect(fillWidths()).toEqual(['100%', '100%', '0%', '0%', '0%']);
  });

  it('keeps disabled rating static and noninteractive', async () => {
    const onRatingChange = vi.fn();
    await render({ rating: 3.5, disabled: true, onRatingChange });
    const radios = [...container.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    expect(radios.every((radio) => radio.disabled)).toBe(true);
    await settle(() => {
      radios[4].click();
      radios[4].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      radios[4].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(onRatingChange).not.toHaveBeenCalled();
    expect(fillWidths()).toEqual(['100%', '100%', '100%', '50%', '0%']);
  });
});
