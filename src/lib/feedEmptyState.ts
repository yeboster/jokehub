/**
 * What the joke feed says when it has nothing to show.
 *
 * Lives here rather than in the page because it is four interacting
 * conditions — is there a search term, is the result set exhausted, is
 * anything filtered — and because getting it wrong means telling the user
 * something untrue about their own data. Strings only: `src/lib/` is outside
 * Tailwind's content globs (`tailwind.config.ts`), so nothing here may return
 * a class name.
 */
export interface FeedEmptyCopy {
  /** The headline: one sentence stating what is not here. */
  title: string;
  /** The second line: what to do about it. */
  hint: string;
  /** Whether the caller should offer a "Clear filters" action. */
  offerClearFilters: boolean;
}

export interface FeedEmptyInput {
  /** The applied search term, `''` for none. */
  search: string;
  /** Whether the feed believes more pages exist for these filters. */
  hasMoreJokes: boolean;
  /** Whether anything at all is filtered (search included). */
  hasActiveFilters: boolean;
}

export function describeEmptyFeed({ search, hasMoreJokes, hasActiveFilters }: FeedEmptyInput): FeedEmptyCopy {
  if (search) {
    // A multi-word search is only partly expressible as a Firestore query, so
    // the service ANDs the remaining tokens client-side and can hand back an
    // empty page while later pages still hold matches (it pages on, but gives
    // up after a bounded number of pages). Claiming "no jokes matched" right
    // above an enabled "Load More" button would be a lie, so say what we
    // actually know.
    return hasMoreJokes
      ? {
          title: `No jokes on this page matched “${search}”.`,
          hint: 'There may be matches further down — load more to keep looking.',
          offerClearFilters: false,
        }
      : {
          title: `No jokes matched “${search}”.`,
          hint: 'Search matches whole keywords of three or more letters. Try a single word, or clear the filters.',
          offerClearFilters: true,
        };
  }

  if (hasActiveFilters) {
    return {
      title: 'No jokes match these filters.',
      hint: 'Loosen one of them, or clear them all and start over.',
      offerClearFilters: true,
    };
  }

  return {
    title: 'No jokes here yet.',
    hint: 'Add the first one and it shows up right away.',
    offerClearFilters: false,
  };
}
