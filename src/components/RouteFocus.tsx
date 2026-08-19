"use client";

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Moves focus to the `<main>` landmark on each client-side route change.
 *
 * The App Router does not move focus, so after clicking a nav link the keyboard
 * position is still on a node the new page does not contain — the next Tab
 * resumes from wherever the browser decides, usually the top of the document,
 * with no announcement that anything happened.
 *
 * Deliberately keyed on `pathname` only: `/jokes` re-navigates to itself on
 * every filter change (`useJokeFilters` pushes a new query string), and pulling
 * focus out of the toolbar each time a chip is removed is exactly the bug Task
 * 13 fixes.
 */
export default function RouteFocus() {
  const pathname = usePathname();
  const isFirstRender = useRef(true);

  useEffect(() => {
    // The first render is the initial page load: the browser has already put
    // focus where it belongs and stealing it would break "start reading at the
    // top" for a screen reader.
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    // `preventScroll`: the router has its own scroll handling, including
    // restoring the previous position on Back. Focusing without it would jump
    // to the top of the page and undo that.
    document.getElementById('main-content')?.focus({ preventScroll: true });
  }, [pathname]);

  return null;
}
