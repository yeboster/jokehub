import { describe, it, expect } from 'vitest';

import { DEV_SITE_URL, SITE_URL, resolveSiteUrl } from '@/lib/siteUrl';

describe('resolveSiteUrl', () => {
  it('prefers an explicit site URL over anything the platform supplies', () => {
    expect(
      resolveSiteUrl({
        NEXT_PUBLIC_SITE_URL: 'https://jokehub.app',
        VERCEL_PROJECT_PRODUCTION_URL: 'jokehub.vercel.app',
        VERCEL_URL: 'jokehub-git-branch.vercel.app',
      })
    ).toBe('https://jokehub.app');
  });

  it('strips trailing slashes, so callers can concatenate a path safely', () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: 'https://jokehub.app///' })).toBe(
      'https://jokehub.app'
    );
  });

  it('adds a scheme to a bare hostname, which is the shape the platform vars come in', () => {
    expect(resolveSiteUrl({ VERCEL_PROJECT_PRODUCTION_URL: 'jokehub.vercel.app' })).toBe(
      'https://jokehub.vercel.app'
    );
  });

  it('keeps an http scheme, so a self-hosted or tunnelled origin is not rewritten', () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: 'http://192.168.1.10:9002' })).toBe(
      'http://192.168.1.10:9002'
    );
  });

  it('falls back to the production host before the per-deployment preview host', () => {
    expect(
      resolveSiteUrl({
        VERCEL_PROJECT_PRODUCTION_URL: 'jokehub.vercel.app',
        VERCEL_URL: 'jokehub-git-branch.vercel.app',
      })
    ).toBe('https://jokehub.vercel.app');
  });

  it('uses the preview host when there is no production host', () => {
    expect(resolveSiteUrl({ VERCEL_URL: 'jokehub-git-branch.vercel.app' })).toBe(
      'https://jokehub-git-branch.vercel.app'
    );
  });

  it('ignores a variable that is set but blank, which is how an unset Vercel env reads', () => {
    expect(
      resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: '   ', VERCEL_URL: 'preview.vercel.app' })
    ).toBe('https://preview.vercel.app');
  });

  it('falls back to the dev origin when nothing is set at all', () => {
    expect(resolveSiteUrl({})).toBe(DEV_SITE_URL);
    expect(resolveSiteUrl()).toBe(DEV_SITE_URL);
  });

  it('skips a malformed first candidate and lets the next one answer', () => {
    expect(
      resolveSiteUrl({
        NEXT_PUBLIC_SITE_URL: 'https://',
        VERCEL_PROJECT_PRODUCTION_URL: 'jokehub.vercel.app',
      })
    ).toBe('https://jokehub.vercel.app');
  });

  it('falls back to the dev origin when every candidate is malformed', () => {
    expect(
      resolveSiteUrl({
        NEXT_PUBLIC_SITE_URL: '///',
        VERCEL_PROJECT_PRODUCTION_URL: 'https://',
        VERCEL_URL: 'http://',
      })
    ).toBe(DEV_SITE_URL);
  });

  it('rejects a candidate that cannot become a URL at all, not just a bare scheme', () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: 'not a host' })).toBe(DEV_SITE_URL);
  });
});

describe('SITE_URL', () => {
  // The seam the exported constant actually crosses: it is resolved once at
  // import time from named `process.env` members, which the injectable-env
  // tests above never exercise. Under vitest none of those three variables is
  // set — `.env.production.local` is Next's to load, not the test runner's — so
  // the whole real path, malformed-candidate check included, has to land on the
  // dev fallback. A future refactor that reads the env some other way, or that
  // resolves lazily, breaks here rather than in production metadata.
  it('resolves from the real process env at import time', () => {
    expect(SITE_URL).toBe(DEV_SITE_URL);
  });
});
