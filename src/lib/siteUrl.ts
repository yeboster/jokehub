/**
 * Where this deployment lives.
 *
 * Three consumers need an absolute origin and none of them can ask the browser
 * for one: `metadataBase` in the root layout, the `Sitemap:` line in
 * `robots.txt`, and every entry in `sitemap.xml`. All three are produced on the
 * server, at build time, where `location` does not exist.
 *
 * Precedence, most specific first:
 *
 *   1. `NEXT_PUBLIC_SITE_URL` — set this by hand once the app has a real domain.
 *      It is the only one that survives a change of hosting provider.
 *   2. `VERCEL_PROJECT_PRODUCTION_URL` — the project's stable production host,
 *      the same on every production deployment.
 *   3. `VERCEL_URL` — the per-deployment host. Different on every push, so a
 *      preview build's metadata points at the preview, which is what you want
 *      when you are checking a link card before shipping it.
 *   4. The dev server's origin.
 *
 * Strings only: `src/lib/` is outside Tailwind's content globs
 * (`tailwind.config.ts`), so nothing here may return a class name.
 */

/** The dev server's origin — `npm run dev` binds port 9002 (`package.json`). */
export const DEV_SITE_URL = 'http://localhost:9002';

/** The environment variables this module reads, as a plain injectable object. */
export interface SiteUrlEnv {
  NEXT_PUBLIC_SITE_URL?: string;
  VERCEL_PROJECT_PRODUCTION_URL?: string;
  VERCEL_URL?: string;
}

/**
 * A hostname becomes an https origin; an origin that already states its scheme
 * keeps it (a tunnel or a LAN address is http and must not be rewritten).
 * Trailing slashes go, so a caller can concatenate a path without producing a
 * doubled slash — the same rule `jokeShareUrl` follows in `src/lib/share.ts`.
 */
function normalizeOrigin(value: string): string {
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return withScheme.replace(/\/+$/, '');
}

/**
 * The absolute origin for this deployment, never with a trailing slash.
 *
 * Takes its environment as an argument so it is testable without touching the
 * real `process.env`; `SITE_URL` below is the one place that supplies the real
 * one.
 */
export function resolveSiteUrl(env: SiteUrlEnv = {}): string {
  const candidates = [
    env.NEXT_PUBLIC_SITE_URL,
    env.VERCEL_PROJECT_PRODUCTION_URL,
    env.VERCEL_URL,
  ];

  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    // A Vercel environment variable that was declared and left blank arrives as
    // an empty string, not as undefined.
    if (trimmed) return normalizeOrigin(trimmed);
  }

  return DEV_SITE_URL;
}

/**
 * The resolved origin for this process. Read once at import time from
 * explicitly named members of `process.env` rather than from the object as a
 * whole: Next inlines `process.env.SOMETHING` at build time only for static
 * member access, and passing the object would silently stop working if this
 * module were ever pulled into a client bundle.
 */
export const SITE_URL = resolveSiteUrl({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  VERCEL_URL: process.env.VERCEL_URL,
});
