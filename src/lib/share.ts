/**
 * Building and copying a shareable link to a joke.
 *
 * The URL construction and the clipboard call are both here rather than in the
 * component, because both have edge cases worth pinning: an origin with a
 * trailing slash would produce `//joke/x`, and `navigator.clipboard` is absent
 * on an insecure origin and rejects when the document is not focused — a failed
 * copy must be reported, not silently swallowed.
 *
 * Strings and booleans only: `src/lib/` is outside Tailwind's content globs
 * (`tailwind.config.ts`), so nothing here may return a class name.
 */

/** The part of `navigator.clipboard` this module uses, so tests can inject one. */
export interface ClipboardLike {
  writeText(text: string): Promise<void>;
}

/**
 * The canonical public URL for a joke. Built from the origin and the id rather
 * than from `location.href`, so a link copied off a filtered or otherwise
 * decorated URL is still the clean one.
 */
export function jokeShareUrl(origin: string, jokeId: string): string {
  return `${origin.replace(/\/+$/, '')}/joke/${encodeURIComponent(jokeId)}`;
}

/**
 * Copies `text`, reporting success as a boolean rather than throwing: the caller
 * shows a toast either way and has nothing useful to do with the rejection
 * value. `false` also covers "there is no clipboard here at all", which is the
 * case on an insecure origin.
 */
export async function copyToClipboard(text: string, clipboard?: ClipboardLike): Promise<boolean> {
  if (!clipboard) return false;
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
