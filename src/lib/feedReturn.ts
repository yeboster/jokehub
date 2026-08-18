/**
 * Remembers which joke feed the user came from, so the detail page's back
 * button returns to it with its filters intact instead of dumping them on the
 * unfiltered public feed.
 *
 * `sessionStorage` rather than history introspection: the App Router does not
 * expose "did this navigation start inside the app", and `router.back()` on a
 * deep link from a search engine leaves the site entirely. A remembered URL is
 * a value we wrote ourselves, so it can be validated.
 *
 * The storage object is a parameter so this is testable without a DOM and so
 * the caller decides between session and local storage.
 */
export const FEED_PATH = '/jokes';

const STORAGE_KEY = 'jokehub:last-feed-url';

/** The slice of the Storage interface this module uses. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * A same-origin path on the feed, and nothing else. The value round-trips
 * through storage, where anything could have put it, so a protocol-relative
 * URL (`//evil.example`) or a path to another route is rejected rather than
 * handed to <Link>.
 */
function isFeedUrl(url: string): boolean {
  return url === FEED_PATH || url.startsWith(`${FEED_PATH}?`);
}

export function rememberFeedUrl(storage: StorageLike | undefined, url: string): void {
  if (!storage || !isFeedUrl(url)) return;
  try {
    storage.setItem(STORAGE_KEY, url);
  } catch {
    // Safari private mode and quota failures: the back button falls back to
    // the plain feed, which is where it went before this existed.
  }
}

export function readFeedUrl(storage: StorageLike | undefined): string {
  if (!storage) return FEED_PATH;
  try {
    const stored = storage.getItem(STORAGE_KEY);
    return stored && isFeedUrl(stored) ? stored : FEED_PATH;
  } catch {
    return FEED_PATH;
  }
}
