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

/** One reading of the feed, as the page's status region reports it. */
export interface FeedSnapshot {
  /** The serialized filter set these results answer (`filtersToSearchParams`). */
  key: string;
  /** How many jokes are on the page, or `null` while a fetch is in flight. */
  count: number | null;
}

/**
 * The text of the feed's status region for the transition `previous` → `next`.
 *
 * One region, four things to say, in priority order: a fetch is running; the
 * result is empty (in which case the region says exactly what the empty state
 * on screen says, so the two cannot contradict each other); a page was appended
 * (delegated to `describeFeedAppend`, which knows that a filter change also
 * changes the count and is not an append); or this is a result set, with its
 * size.
 *
 * Never returns `''`. The region is mounted permanently and only announces when
 * its text *changes*, so a blank string would be a wasted state — and the size
 * of a result set is precisely the fact the feed has never reported.
 */
export function describeFeedStatus(
  previous: FeedSnapshot | null,
  next: FeedSnapshot,
  emptyTitle: string
): string {
  if (next.count === null) return 'Loading jokes…';
  if (next.count === 0) return emptyTitle;

  const append =
    previous && previous.count !== null
      ? describeFeedAppend(
          { key: previous.key, count: previous.count },
          { key: next.key, count: next.count }
        )
      : '';

  return append || `${next.count} joke${next.count === 1 ? '' : 's'} shown.`;
}

/**
 * The visible tally under the feed: `Showing 24 jokes so far.` while more
 * pages exist, `Showing all 24 jokes.` once the set is exhausted.
 *
 * It replaces "No more jokes to load for the current filters.", which reported
 * the absence of more jokes and never the size of what was there — the one
 * number a user with a large collection actually wants. `''` for an empty set:
 * the empty state is already saying everything there is to say.
 */
export function describeFeedTally(count: number, hasMore: boolean): string {
  if (count <= 0) return '';
  const jokes = `${count} joke${count === 1 ? '' : 's'}`;
  return hasMore ? `Showing ${jokes} so far.` : `Showing all ${jokes}.`;
}
