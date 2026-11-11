/** Where the auth page sends a signed-in user when no `redirect` is given. */
export const DEFAULT_AUTH_REDIRECT = '/jokes';

/** Placeholder origin: only used to tell whether a value would leave the site. */
const PROBE_ORIGIN = 'https://jokehub.invalid';

/**
 * The auth page's `redirect` query value when it is a path on this site, and
 * the default otherwise. Anyone can put any value in the query string, so an
 * absolute URL, a protocol-relative URL (`//host`) or a browser-normalized
 * variant of one (`/\host`, `/<tab>/host`) is rejected rather than pushed.
 * Parsing with `URL` applies the same normalization the browser would.
 */
export function safeRedirectPath(value: string | null): string {
  if (!value || !value.startsWith('/')) return DEFAULT_AUTH_REDIRECT;
  let url: URL;
  try {
    url = new URL(value, PROBE_ORIGIN);
  } catch {
    return DEFAULT_AUTH_REDIRECT;
  }
  if (url.origin !== PROBE_ORIGIN) return DEFAULT_AUTH_REDIRECT;
  return `${url.pathname}${url.search}${url.hash}`;
}
