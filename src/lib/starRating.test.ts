import { describe, it, expect } from 'vitest';

import { ratingFromKey, tabbableStarIndex } from '@/lib/starRating';

const MAX = 5;

describe('ratingFromKey', () => {
  it('steps up to the first star from nothing chosen', () => {
    expect(ratingFromKey('ArrowRight', 0, MAX)).toBe(1);
  });

  it('steps up by one from the middle of the range', () => {
    expect(ratingFromKey('ArrowRight', 3, MAX)).toBe(4);
  });

  it('wraps from the last star back to the first', () => {
    expect(ratingFromKey('ArrowRight', MAX, MAX)).toBe(1);
  });

  it('treats ArrowUp exactly as ArrowRight, for forms-mode navigation', () => {
    for (const current of [0, 1, 3, MAX]) {
      expect(ratingFromKey('ArrowUp', current, MAX)).toBe(ratingFromKey('ArrowRight', current, MAX));
    }
  });

  it('wraps to the last star when stepping back from nothing chosen', () => {
    expect(ratingFromKey('ArrowLeft', 0, MAX)).toBe(MAX);
  });

  it('steps down by one from the middle of the range', () => {
    expect(ratingFromKey('ArrowLeft', 3, MAX)).toBe(2);
  });

  it('wraps from the first star back to the last', () => {
    expect(ratingFromKey('ArrowLeft', 1, MAX)).toBe(MAX);
  });

  it('treats ArrowDown exactly as ArrowLeft', () => {
    for (const current of [0, 1, 3, MAX]) {
      expect(ratingFromKey('ArrowDown', current, MAX)).toBe(ratingFromKey('ArrowLeft', current, MAX));
    }
  });

  it('jumps to the first star on Home', () => {
    expect(ratingFromKey('Home', 4, MAX)).toBe(1);
  });

  it('jumps to the last star on End', () => {
    expect(ratingFromKey('End', 2, MAX)).toBe(MAX);
  });

  it('leaves every key it does not handle alone', () => {
    for (const key of ['a', 'Enter', ' ', 'Tab', 'Escape', 'PageUp']) {
      expect(ratingFromKey(key, 3, MAX)).toBeNull();
    }
  });

  it('handles a range of one star, where every move stays on it', () => {
    expect(ratingFromKey('ArrowRight', 1, 1)).toBe(1);
    expect(ratingFromKey('ArrowLeft', 1, 1)).toBe(1);
    expect(ratingFromKey('End', 0, 1)).toBe(1);
  });

  it('refuses a range with no stars in it', () => {
    for (const key of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) {
      expect(ratingFromKey(key, 0, 0)).toBeNull();
    }
  });
});

describe('tabbableStarIndex', () => {
  it('puts the tab stop on the first star when nothing is chosen', () => {
    expect(tabbableStarIndex(0, MAX)).toBe(0);
  });

  it('puts the tab stop on the chosen star', () => {
    expect(tabbableStarIndex(3, MAX)).toBe(2);
  });

  it('puts the tab stop on the nearest star for a fractional rating', () => {
    expect(tabbableStarIndex(4.2, MAX)).toBe(3);
    expect(tabbableStarIndex(0.4, MAX)).toBe(0);
  });

  it('falls back to the first star for a rating above the range', () => {
    expect(tabbableStarIndex(99, MAX)).toBe(0);
  });

  it('falls back to the first star for a negative rating', () => {
    expect(tabbableStarIndex(-3, MAX)).toBe(0);
  });

  it('falls back to the first star for a rating that is not a number', () => {
    expect(tabbableStarIndex(Number.NaN, MAX)).toBe(0);
    expect(tabbableStarIndex(Number.POSITIVE_INFINITY, MAX)).toBe(0);
  });

  it('always names exactly one tab stop inside the group', () => {
    for (const rating of [0, 1, 2.5, 5, 12, Number.NaN]) {
      const index = tabbableStarIndex(rating, MAX);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(MAX);
    }
  });
});
