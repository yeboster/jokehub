/**
 * What the feed says when "Load More" has appended a page.
 *
 * Counting alone is not enough to tell an append from a filter change: both
 * change the number of cards on the page. A count is only comparable against
 * another count taken for the *same* filter set, so the key travels with it.
 *
 * Strings only: `src/lib/` is outside Tailwind's content globs.
 */
export interface FeedCountSnapshot {
  /** The serialized filter set these results answer (`filtersToSearchParams`). */
  key: string;
  /** How many jokes were on the page. */
  count: number;
}

/**
 * The announcement for the transition `previous` → `next`, or `''` when there
 * is nothing to announce. Empty for: the first snapshot ever; a different
 * filter set (that is a new result set, not an append); the first page of a
 * filter set (the page painting for the first time is not "more"); and any
 * transition that did not grow.
 */
export function describeFeedAppend(
  previous: FeedCountSnapshot | null,
  next: FeedCountSnapshot
): string {
  if (!previous) return '';
  if (previous.key !== next.key) return '';
  if (previous.count === 0) return '';
  if (next.count <= previous.count) return '';

  const added = next.count - previous.count;
  return `${added} more joke${added === 1 ? '' : 's'} loaded. ${next.count} now showing.`;
}
