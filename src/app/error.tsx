"use client";

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

import EmptyState from '@/components/EmptyState';
import { Button } from '@/components/ui/button';

/**
 * The error boundary for every route below `src/app/`.
 *
 * Next requires this to be a client component: it holds the boundary itself and
 * the `reset` callback. It replaces the failed segment's content only — the root
 * layout stays mounted, so the navigation, the theme and the toaster survive and
 * the user is still somewhere rather than nowhere.
 *
 * It deliberately does *not* render the error message. Six of the seven routes
 * fetch from Firestore, and a raw exception string can carry a document id or a
 * rule name; `digest` is the handle a developer needs and it is already in the
 * console line below and in the server logs.
 *
 * This does not catch a throw in the root layout — nothing below the layout can.
 * `global-error.tsx` does.
 */

/**
 * Said once on screen and once to a screen reader, from one string so the two
 * can never drift apart.
 */
const ERROR_HEADLINE = 'Something went wrong.';

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    console.error('Unhandled error in a route segment:', error);
    // Set from the effect, not from the initial render, and that is the whole
    // trick: a live region only speaks changes made after it is in the DOM, so
    // one that mounts already holding its message announces nothing at all.
    // Mount empty, fill on the next commit, and the failure is spoken.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the deferral is the feature: a live region that renders with its text never announces, so the text has to arrive in a later commit than the region.
    setAnnouncement(ERROR_HEADLINE);
  }, [error]);

  return (
    <div className="container mx-auto px-4 py-8 sm:px-6 md:py-12">
      {/*
        The boundary swaps the segment's content without moving focus and
        without changing the document title, so until now a screen reader user
        got silence where the page used to be. Polite and visually hidden, the
        same shape the feed's status line uses in `src/app/jokes/page.tsx`. Not
        a focus move: the user did not ask to go anywhere.
      */}
      <p role="status" className="sr-only">{announcement}</p>
      <EmptyState
        icon={AlertTriangle}
        // The page's only heading: this branch renders no Header, exactly like
        // the joke-not-found branch.
        titleAs="h1"
        title={ERROR_HEADLINE}
        hint="This page hit an unexpected error. Trying again reloads just this section — the rest of the app is fine."
        action={<Button onClick={reset}>Try again</Button>}
      />
    </div>
  );
}
