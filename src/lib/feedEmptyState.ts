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
  /** Whether the caller should offer a "Try again" action. */
  offerRetry: boolean;
}

export interface FeedEmptyInput {
  /** The applied search term, `''` for none. */
  search: string;
  /** Whether the feed believes more pages exist for these filters. */
  hasMoreJokes: boolean;
  /** Whether anything at all is filtered (search included). */
  hasActiveFilters: boolean;
  /** The message from a failed fetch, or null when the feed simply has nothing. */
  error?: string | null;
}

export function describeEmptyFeed({ search, hasMoreJokes, hasActiveFilters, error }: FeedEmptyInput): FeedEmptyCopy {
  // A failure outranks every other reading of an empty list: the previous copy
  // blamed the user's filters for a dropped connection, and offered to adjust
  // them.
  if (error) {
    return {
      title: "We couldn't load the jokes.",
      // Any terminal punctuation is replaced, not just a period: `/\.?$/` left
      // "Failed!" as "Failed!." in front of the next sentence.
      hint: `${error.replace(/[.!?]?$/, '.')} Check your connection and try again.`,
      offerClearFilters: false,
      offerRetry: true,
    };
  }

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
          offerRetry: false,
        }
      : {
          title: `No jokes matched “${search}”.`,
          hint: 'Search matches whole keywords of three or more letters. Try a single word, or clear the filters.',
          offerClearFilters: true,
          offerRetry: false,
        };
  }

  if (hasActiveFilters) {
    return {
      title: 'No jokes match these filters.',
      hint: 'Loosen one of them, or clear them all and start over.',
      offerClearFilters: true,
      offerRetry: false,
    };
  }

  return {
    title: 'No jokes here yet.',
    hint: 'Add the first one and it shows up right away.',
    offerClearFilters: false,
    offerRetry: false,
  };
}

/**
 * The empty feed as one announced sentence.
 *
 * The visible block stacks the headline above the hint and a sighted user reads
 * both. A live region has no layout: it announces the text it holds, so the two
 * lines are one utterance or the second one reaches nobody. The feed's region
 * spoke the headline alone until now, which meant every instruction this module
 * writes — how search tokenizes, that filters can be cleared, that a failed
 * fetch can be retried — was invisible to a screen reader.
 *
 * Both strings already end in a full stop (pinned by this module's suite), so a
 * single space is the whole join.
 */
export function emptyFeedAnnouncement(copy: FeedEmptyCopy): string {
  return [copy.title, copy.hint]
    .map(part => part.trim())
    .filter(Boolean)
    .join(' ');
}
