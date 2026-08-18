import { describe, it, expect } from 'vitest';

import { entranceDelayMs, MAX_STAGGERED_ITEMS, STAGGER_STEP_MS } from '@/lib/motion';

describe('entranceDelayMs', () => {
  it('gives the first card no delay', () => {
    expect(entranceDelayMs(0)).toBe(0);
  });

  it('steps by STAGGER_STEP_MS for each following card', () => {
    expect(entranceDelayMs(1)).toBe(STAGGER_STEP_MS);
    expect(entranceDelayMs(2)).toBe(2 * STAGGER_STEP_MS);
    expect(entranceDelayMs(5)).toBe(5 * STAGGER_STEP_MS);
  });

  it('caps the delay so a long page does not trail off', () => {
    const cap = (MAX_STAGGERED_ITEMS - 1) * STAGGER_STEP_MS;
    expect(entranceDelayMs(MAX_STAGGERED_ITEMS - 1)).toBe(cap);
    expect(entranceDelayMs(MAX_STAGGERED_ITEMS)).toBe(cap);
    expect(entranceDelayMs(500)).toBe(cap);
  });

  it('never returns a negative delay', () => {
    expect(entranceDelayMs(-1)).toBe(0);
    expect(entranceDelayMs(-999)).toBe(0);
  });

  it('tolerates a non-integer index', () => {
    expect(entranceDelayMs(2.9)).toBe(2 * STAGGER_STEP_MS);
  });

  it('tolerates NaN', () => {
    expect(entranceDelayMs(Number.NaN)).toBe(0);
  });
});
