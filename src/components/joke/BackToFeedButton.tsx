"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { FEED_PATH, readFeedUrl } from '@/lib/feedReturn';

/**
 * Back to the feed the user came from, filters and all.
 *
 * The href starts at the plain feed and is upgraded in an effect: reading
 * `sessionStorage` during render would differ between the server and the
 * client and trip hydration.
 */
export default function BackToFeedButton() {
  const [href, setHref] = useState<string>(FEED_PATH);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading an external store (sessionStorage) after hydration is the one case this pattern is for: during render it would disagree with the server-rendered href.
    setHref(readFeedUrl(window.sessionStorage));
  }, []);

  return (
    <Button variant="outline" size="sm" asChild>
      <Link href={href}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to jokes
      </Link>
    </Button>
  );
}
