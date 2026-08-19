import Link from 'next/link';
import { Compass } from 'lucide-react';

import EmptyState from '@/components/EmptyState';
import { Button } from '@/components/ui/button';

/**
 * Next renders this for any URL that matches no route, and for any
 * `notFound()` call. It is a server component with the root layout around it,
 * so the navigation bar is present and the user is not stranded.
 *
 * Not the same page as the joke-not-found branch in `/joke/[jokeId]`: that one
 * knows a joke was asked for and says so. This one only knows the URL matched
 * nothing.
 *
 * It exports no `metadata`. `not-found.tsx` is not a route segment and Next does
 * not read a metadata export from it, so the tab keeps the root default,
 * "Joke Hub". Recorded rather than attempted.
 */
export default function NotFound() {
  return (
    <div className="container mx-auto px-4 py-8 sm:px-6 md:py-12">
      <EmptyState
        icon={Compass}
        titleAs="h1"
        title="That page doesn’t exist."
        hint="The link may be wrong, or the page may have moved."
        action={
          <Button asChild>
            <Link href="/jokes">Browse jokes</Link>
          </Button>
        }
      />
    </div>
  );
}
