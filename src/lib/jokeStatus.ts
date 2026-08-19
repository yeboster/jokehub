/**
 * What the joke page's status region says once a load has settled.
 *
 * The page has three outcomes — a joke, no such joke, a failed request — and
 * two of them render a block that a screen reader is never told about. A region
 * that mounts with its message does not announce (round 6), so the page mounts
 * this one empty and fills it from an effect; this module decides the text.
 *
 * The copy is exported as constants because the not-found branch renders the
 * same two strings visibly. One source, so the region and the screen cannot
 * drift apart — the rule `/jokes` follows with its empty state.
 *
 * Strings only: `src/lib/` is outside Tailwind's content globs
 * (`tailwind.config.ts`), so nothing here may return a class name.
 */

/** The headline of the joke-not-found empty state. */
export const JOKE_NOT_FOUND_TITLE = "We couldn't find that joke.";

/** Its second line. */
export const JOKE_NOT_FOUND_HINT = 'It may have been deleted, or the link may be wrong.';

export interface JokeLoadResult {
  /** The message from a failed load, or null/undefined when the request worked. */
  error?: string | null;
  /** Whether a joke came back. */
  found: boolean;
}

/**
 * The announcement for a settled load, or `''` when the joke is there.
 *
 * A failure outranks a missing joke: "we could not reach the server" is
 * actionable and "there is no such joke" is not, and the page renders the error
 * branch first for the same reason. `''` for a loaded joke, because the page
 * then has an h1 with the joke in it and Next's route announcer has already
 * spoken the title — announcing "joke loaded" on top of that is noise.
 */
export function describeJokeLoadResult({ error, found }: JokeLoadResult): string {
  const reason = error?.trim();
  // Any terminal punctuation is replaced, not just a period: a message ending
  // in '!' would otherwise be announced as "Failed!.". Same rule as the feed's
  // error copy in `feedEmptyState.ts`.
  if (reason) return reason.replace(/[.!?]?$/, '.');
  if (!found) return `${JOKE_NOT_FOUND_TITLE} ${JOKE_NOT_FOUND_HINT}`;
  return '';
}
