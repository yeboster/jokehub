/**
 * Keyboard arithmetic for a star-rating radio group (ARIA APG "radio group",
 * which selects on arrow navigation rather than on a separate commit).
 *
 * Pure integers in, pure integers out: `src/lib/` is outside Tailwind's content
 * globs and this returns no markup and no class names.
 */

/**
 * The rating a key press moves to, or `null` when the key is not one this
 * widget handles (so the caller can leave the event alone).
 *
 * Both axes are wired: a horizontal row of stars is read horizontally by a
 * sighted user and vertically by a screen reader in forms mode. Movement wraps,
 * per the APG, which is also what makes `current === 0` — nothing chosen yet —
 * land on 1 going forward and on `maxStars` going back.
 */
export function ratingFromKey(key: string, current: number, maxStars: number): number | null {
  if (maxStars < 1) return null;

  switch (key) {
    case 'ArrowRight':
    case 'ArrowUp':
      return current >= maxStars ? 1 : current + 1;
    case 'ArrowLeft':
    case 'ArrowDown':
      return current <= 1 ? maxStars : current - 1;
    case 'Home':
      return 1;
    case 'End':
      return maxStars;
    default:
      return null;
  }
}

/**
 * Which star is the group's single tab stop (roving tabindex): the chosen one,
 * or the first when nothing is chosen yet — the APG's rule for an unset radio
 * group. Guards a fractional or out-of-range `rating`, which the read-only
 * branch supports and which could otherwise leave the group with no tab stop
 * at all.
 */
export function tabbableStarIndex(rating: number, maxStars: number): number {
  if (!Number.isFinite(rating)) return 0;
  const rounded = Math.round(rating);
  return rounded >= 1 && rounded <= maxStars ? rounded - 1 : 0;
}
