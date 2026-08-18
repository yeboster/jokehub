/** Milliseconds between consecutive cards in a staggered grid entrance. */
export const STAGGER_STEP_MS = 40;

/**
 * How many cards get a distinct delay before the stagger flattens out.
 *
 * A page of jokes can be 20+ cards; at 40ms apiece an uncapped stagger would
 * make the last card wait most of a second after the first, which reads as a
 * slow page rather than a lively one. Past the cap every remaining card shares
 * the final delay and enters together.
 */
export const MAX_STAGGERED_ITEMS = 12;

/**
 * Entrance delay for the card at `index` in a grid.
 *
 * Defensive against the two things a caller can get wrong: a negative index
 * (clamped to 0, never a negative `animation-delay`, which CSS treats as
 * "already partly played") and a non-integer index from an odd map.
 */
export function entranceDelayMs(index: number): number {
  if (!Number.isFinite(index) || index <= 0) return 0;
  const position = Math.min(Math.floor(index), MAX_STAGGERED_ITEMS - 1);
  return position * STAGGER_STEP_MS;
}

/**
 * A grid's entrance bookkeeping from one render to the next.
 */
export interface StaggerBatch {
  /** Identity of the grid's first item — how an append is told from a reset. */
  firstId: string | null;
  /** How many items the grid held. */
  count: number;
  /** Absolute index of the first item of the batch that entered most recently. */
  start: number;
}

/**
 * Where the batch of cards that is mounting right now starts.
 *
 * Entrance delays have to be batch-relative, not grid-absolute. "Load More"
 * appends a page onto the end of the list, so by absolute index page 2 starts
 * at 10 and page 3 at 20 — every card past `MAX_STAGGERED_ITEMS` shares the
 * capped delay and the whole appended page lands on one frame, which is exactly
 * the hard cut the stagger exists to remove. Measuring from `start` restarts
 * the stagger at the first genuinely new card.
 *
 * An append is "same first item, more items than last time". Anything else — a
 * filter applied, a joke deleted, the first load — is a new list, and the whole
 * grid staggers from zero again.
 *
 * Pure and idempotent: this runs during render, so re-rendering with an
 * unchanged list must return the previous answer rather than derive a new one.
 * React can render the same state twice, and StrictMode does so deliberately in
 * development; re-deriving would silently flatten a page-2 stagger to nothing.
 */
export function nextStaggerBatch(
  previous: StaggerBatch | null,
  firstId: string | null,
  count: number
): StaggerBatch {
  if (previous && previous.firstId === firstId) {
    if (count === previous.count) return previous;
    if (count > previous.count) return { firstId, count, start: previous.count };
  }
  return { firstId, count, start: 0 };
}
