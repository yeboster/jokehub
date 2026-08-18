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
