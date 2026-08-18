import { describe, it, expect } from 'vitest';

import {
  entranceDelayMs,
  MAX_STAGGERED_ITEMS,
  nextStaggerBatch,
  STAGGER_STEP_MS,
  type StaggerBatch,
} from '@/lib/motion';

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

describe('nextStaggerBatch', () => {
  it('starts the first render at zero', () => {
    expect(nextStaggerBatch(null, 'a', 10)).toEqual({ firstId: 'a', count: 10, start: 0 });
  });

  it('treats an empty grid as a reset', () => {
    expect(nextStaggerBatch(null, null, 0)).toEqual({ firstId: null, count: 0, start: 0 });
  });

  it('starts an appended page at the previous count', () => {
    const first = nextStaggerBatch(null, 'a', 10);
    expect(nextStaggerBatch(first, 'a', 20)).toEqual({ firstId: 'a', count: 20, start: 10 });
  });

  it('keeps restarting the stagger on each further page', () => {
    let batch = nextStaggerBatch(null, 'a', 10);
    batch = nextStaggerBatch(batch, 'a', 20);
    batch = nextStaggerBatch(batch, 'a', 30);
    expect(batch.start).toBe(20);
  });

  it('gives every card of an appended page a distinct delay', () => {
    const page2 = nextStaggerBatch(nextStaggerBatch(null, 'a', 10), 'a', 20);
    // Absolute indices 10–19 would all sit past the cap and enter together;
    // measured from `start` they step 40ms apart like page 1 did.
    const delays = [10, 11, 12, 19].map((i) => entranceDelayMs(i - page2.start));
    expect(delays).toEqual([0, STAGGER_STEP_MS, 2 * STAGGER_STEP_MS, 9 * STAGGER_STEP_MS]);
  });

  it('is idempotent for a re-render with an unchanged list', () => {
    const page2 = nextStaggerBatch(nextStaggerBatch(null, 'a', 10), 'a', 20);
    const rerender = nextStaggerBatch(page2, 'a', 20);
    expect(rerender).toBe(page2);
    expect(rerender.start).toBe(10);
  });

  it('resets when the first item changes, as on a filter change', () => {
    const loaded: StaggerBatch = nextStaggerBatch(null, 'a', 10);
    expect(nextStaggerBatch(loaded, 'z', 25)).toEqual({ firstId: 'z', count: 25, start: 0 });
  });

  it('resets when the list shrinks, as on a delete', () => {
    const loaded = nextStaggerBatch(null, 'a', 10);
    expect(nextStaggerBatch(loaded, 'a', 9)).toEqual({ firstId: 'a', count: 9, start: 0 });
  });

  it('resets after the grid empties out', () => {
    const loaded = nextStaggerBatch(null, 'a', 10);
    const emptied = nextStaggerBatch(loaded, null, 0);
    expect(nextStaggerBatch(emptied, 'b', 10).start).toBe(0);
  });
});
