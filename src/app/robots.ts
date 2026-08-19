import type { MetadataRoute } from 'next';

import { SITE_URL } from '@/lib/siteUrl';

/**
 * Next serves this at `/robots.txt`.
 *
 * The disallow list is every route that needs a session to mean anything. They
 * are not secret — `firestore.rules` decides what is readable, not this file,
 * and a crawler ignoring robots.txt still gets a permission error. The point is
 * that a login form and an edit form have no business in a search result, and a
 * crawler walking `/edit-joke/<id>` for every joke spends the crawl budget that
 * should have gone to the feed.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/add-joke', '/edit-joke/', '/manage', '/auth'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
