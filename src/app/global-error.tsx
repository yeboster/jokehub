"use client";

import { useEffect } from 'react';

import { Button } from '@/components/ui/button';

// The root layout is what failed, so its stylesheet import went with it. This
// one is ours.
import './globals.css';

/**
 * The boundary of last resort: a throw in the root layout itself — a provider,
 * the navigation bar, the font loader. It replaces the entire document, so it
 * renders its own html and body, and it runs with none of the app's providers.
 *
 * Two consequences, both accepted rather than worked around:
 *
 *   - No theme provider, so this page is always light. Adding one would mean
 *     mounting the provider that may be the thing that just crashed.
 *   - No font variable on the body, so it renders in the system sans face. The
 *     stylesheet above still supplies the colour tokens and the type scale.
 *
 * `Button` is safe here: it is a plain forwardRef with no hooks and no context.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled error in the root layout:', error);
  }, [error]);

  return (
    <html lang="en">
      <body className="antialiased bg-background text-foreground">
        <main className="container mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-4 py-8 text-center sm:px-6 md:py-12">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Joke Hub didn’t load.</h1>
          <p className="mt-3 text-base text-muted-foreground sm:text-lg">
            Something failed before the page could start. Reloading usually fixes it.
          </p>
          <div className="mt-6">
            <Button onClick={reset}>Reload</Button>
          </div>
        </main>
      </body>
    </html>
  );
}
