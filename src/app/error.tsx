"use client";

import { useEffect } from 'react';
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
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled error in a route segment:', error);
  }, [error]);

  return (
    <div className="container mx-auto px-4 py-8 sm:px-6 md:py-12">
      <EmptyState
        icon={AlertTriangle}
        // The page's only heading: this branch renders no Header, exactly like
        // the joke-not-found branch.
        titleAs="h1"
        title="Something went wrong."
        hint="This page hit an unexpected error. Trying again reloads just this section — the rest of the app is fine."
        action={<Button onClick={reset}>Try again</Button>}
      />
    </div>
  );
}
