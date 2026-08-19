import type { MetadataRoute } from 'next';

import { SITE_URL } from '@/lib/siteUrl';

/**
 * Next serves this at `/sitemap.xml`.
 *
 * Two entries, deliberately. The public surface of this app is the landing page
 * and the feed; everything else either needs a session or is a single joke.
 *
 * Per-joke URLs are *not* here. Listing them means reading the collection at
 * build time through the Admin SDK, which is the same data-layer change a
 * per-joke `<title>` needs and which rounds 6 and 7 both deferred — and a
 * build-time list goes stale the moment somebody adds a joke. `/jokes` links to
 * every joke, so a crawler reaches them all from here in one hop.
 *
 * No `lastModified`: stamping it with the build time would report a change on
 * every deploy whether or not anything changed, which is exactly the signal it
 * is supposed to carry.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL}/`,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${SITE_URL}/jokes`,
      changeFrequency: 'daily',
      priority: 0.8,
    },
  ];
}
