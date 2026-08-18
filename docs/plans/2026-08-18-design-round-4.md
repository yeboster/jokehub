# Joke Hub — Design Round 4: Polish + Animations Implementation Plan

> **For Hermes:** Execute task-by-task via Claude Code CLI (`claude -p`, `--model claude-opus-5`).
> One background run per task (implementer), then one read-only review run. Fix loop until review passes.

**Goal:** Give the app a coherent motion language and a coherent visual system — staggered list entrances, real hover/press feedback, star-rating interaction preview, aligned overlay transitions, a proper skeleton shimmer, one typography scale, one elevation scale, dark-mode surface separation, real empty states, and mobile breathing room — **without changing a single behaviour**.

**Architecture:** Next.js 16 App Router + TypeScript + ShadCN/Tailwind + Firebase (client SDK + Admin SDK in API routes) + Genkit. State via `JokeContext`/`AuthContext`. Tests via Vitest (jsdom default).

**Tech stack decision — animation library:**
`framer-motion@^11.5.7` **is already a dependency** and is already used in `src/app/add-joke/page.tsx` (AI variation cards). **This round adds no new dependencies and does not extend framer-motion usage.** All new motion is pure CSS/Tailwind — keyframes registered in `tailwind.config.ts`, utility classes, `motion-safe:`/`motion-reduce:` variants, and one raw `@media (prefers-reduced-motion: reduce)` block in `globals.css`. Reasons:
- A CSS mount animation plays exactly when React inserts the DOM node. Cards keyed by `joke.id` that survive a "Load More" append are *not* re-inserted, so only new cards animate — for free, with no `AnimatePresence` bookkeeping.
- No JS runs per card on a 4-column grid, and no page that doesn't already import framer-motion grows its client bundle.
- Nothing in the render path changes, so the `loadedFilters` stale-paint guard and the scoped-skeleton swap are untouched.

The existing framer-motion block in `add-joke/page.tsx` is **left exactly as it is** — removing it is out of scope for a polish round.

**Baseline (verified 2026-08-18):** `npm run lint` ✅ · `npm run typecheck` ✅ · `npm test` **152/152 in 9 files** ✅

**Universal verification gate for every task:**
```bash
npm run lint && npm run typecheck && npm test
```
All three must pass before committing. Commit per task with the given message. Test count must be **≥ 152** after every task (Task 3 raises it; nothing may lower it).

**Hard constraints for this round:**
1. **No behaviour changes.** No new network calls, no new state that feeds a fetch, no changed props that alter what is fetched or when. Visual/interaction feedback only.
2. **Do not touch** `src/contexts/JokeContext.tsx`, `src/hooks/useJokeFilters.ts`, `src/lib/jokeFilters.ts`, or any `src/services/**`. The `loadedFilters` stale-paint guard in `src/app/page.tsx:45-50` and `src/app/jokes/page.tsx:123-124` must survive byte-identical.
3. **Skeleton parity.** `JokeGridSkeleton` in `src/app/jokes/page.tsx` mirrors `JokeListItem`'s card chrome. Any change to one requires the matching change to the other **in the same commit**, or the skeleton→content swap will visibly jump.
4. **`prefers-reduced-motion` is respected by every animation this round adds.**

---

## Design audit — what this round fixes

**Motion**
- **M1** No entrance animation anywhere. After the skeleton grid unmounts, up to 8 real cards appear in a single frame. The skeleton→content swap is the most-seen transition in the app and it is a hard cut.
- **M2** No `prefers-reduced-motion` handling exists anywhere in the codebase (grep: zero hits). `animate-pulse`, `animate-spin`, every Radix `data-[state]` animation and the framer-motion block all run unconditionally. WCAG 2.3.3 gap.
- **M3** No press state on anything. `JokeListItem` has `hover:shadow-xl transition-shadow` only; `buttonVariants` has `transition-colors` and nothing for `:active`. Tapping a card or a button gives zero acknowledgement — on mobile, where hover doesn't exist, that's the *only* feedback channel and it's empty.
- **M4** `StarRating` interactive mode has no hover preview. You cannot see what four stars looks like before committing. `RatingForm` passes `starClassName="text-primary hover:text-primary/70"`, which dims the single star under the cursor — the opposite of a preview, and it reads as "this star is disabled".
- **M5** `DialogOverlay` (`ui/dialog.tsx:24`) carries no `duration-*`, so it uses tailwindcss-animate's 150ms default while `DialogContent` (`:41`) is pinned to `duration-200`. The overlay finishes fading 50ms before the panel on every close. `PopoverContent` has no duration at all.
- **M6** Skeleton shimmer is a flat `animate-pulse` opacity blink on the whole card, border included, so the card outline throbs.
- **M7** `theme-toggle.tsx:24` positions the Moon icon `absolute` inside a Button that is not `relative`. It works today only because an all-`auto` absolute box stays at its static position — one stray `relative` on an ancestor and the icon flies.

**Visual**
- **V1 Elevation is flat because everything is loud.** `shadow-lg` on grid cards, `shadow-lg` on all three detail-page cards, `shadow-xl` on the auth card, `hover:shadow-xl` on grid cards. When every surface shouts there is no hierarchy. ShadCN's own `Card` default is `shadow-sm`.
- **V2 Dark mode has no card surface.** `--card: 0 0% 10%` is *identical* to `--background: 0 0% 10%`, and box-shadows are invisible on near-black. Every card in dark mode is separated from the page by nothing but `border-primary/20`. `--popover` has the same problem, so dialogs and comboboxes float on an indistinguishable plane.
- **V3 Five different type scales.** h1 is `text-4xl sm:text-5xl` on `/jokes`, `text-3xl md:text-4xl` on the joke detail page, `text-3xl` in `components/header.tsx`, `text-2xl` on the auth card; the home section h2 is `text-3xl` — larger than three of the h1s. `add-joke-form.tsx` runs an undocumented `text-xs` label scale of its own.
- **V4 Five different page containers.** `px-4 py-10 sm:py-16` (home), `p-4 md:p-8` (jokes / joke / add-joke / manage), `py-12 px-4` (auth). The `/jokes` filter bar is `mb-6 p-4 … border-b pb-6` — `p-4` and `pb-6` fighting on the same edge.
- **V5 Empty states are three grey lines.** `JokeList` empty = icon + two muted `<p>`s. Home empty = a bare `<p>`, no icon at all. `CommunityRatings` empty = a bare `<p>`. The joke-not-found card has no icon and no shape.
- **V6 Home page wastes ~7rem above the fold.** `header.mb-12 sm:mb-16` stacked on the tagline's own `mb-16`.
- **V7 `/jokes` filter bar cannot wrap.** `flex items-center gap-x-2 gap-y-3` with no `flex-wrap`, and the action cluster pinned with `ml-auto`. On a phone the Filters button, the active-filter badges and a button reading "Log in to Add Jokes" are all crushed into one non-wrapping row.
- **V8 Focus ring inconsistency.** `joke-list-item.tsx:32` uses `focus:ring-2` (not `focus-visible:`), so a mouse click leaves a persistent ring on the card. Every `Button` in the app uses `focus-visible:`.

**Deliberately deferred (documented in Task 18, not implemented):**
- A page-wide colour crossfade on theme change. `ThemeProvider` sets `disableTransitionOnChange` (`layout.tsx:44`), which suppresses transitions during the swap on purpose — that flag prevents a hydration-time flash. Trading a first-paint flash for a 200ms crossfade is a bad deal; this round polishes the toggle *icon* transition instead (Task 11).
- Adding CTAs to empty states. The scope for this round is "icon + copy"; a "Clear filters" button inside `JokeList` would be new behaviour, which constraint 1 forbids.
- Removing framer-motion from `add-joke/page.tsx`.

---

### Task 1: Register motion keyframes and easing tokens

**Objective:** One place that defines the round's motion vocabulary, so no task invents its own timing.

**Files:**
- Modify: `tailwind.config.ts`

**Steps:**

1. Replace the `keyframes` and `animation` blocks inside `theme.extend` (currently `tailwind.config.ts:73-94`) with:

```ts
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			},
  			// Cards enter from slightly below and slightly small. Kept under
  			// 8px of travel: anything larger reads as a page transition rather
  			// than "this item just arrived".
  			'card-enter': {
  				from: {
  					opacity: '0',
  					transform: 'translateY(8px) scale(0.98)'
  				},
  				to: {
  					opacity: '1',
  					transform: 'translateY(0) scale(1)'
  				}
  			},
  			// A highlight sweeping across a skeleton bar. Travels 200% of its
  			// own width so the gradient clears the bar at both ends.
  			shimmer: {
  				from: {
  					transform: 'translateX(-100%)'
  				},
  				to: {
  					transform: 'translateX(100%)'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out',
  			// `both` fill mode matters: staggered cards must hold the `from`
  			// state through their delay, or every card paints at full opacity
  			// for one frame and then snaps back to invisible.
  			'card-enter': 'card-enter 320ms cubic-bezier(0.22, 1, 0.36, 1) both',
  			shimmer: 'shimmer 1.6s ease-in-out infinite'
  		},
  		transitionTimingFunction: {
  			// The round's two easings. `emphasized` overshoots slightly and is
  			// for things entering; `standard` is for state changes in place.
  			emphasized: 'cubic-bezier(0.22, 1, 0.36, 1)',
  			standard: 'cubic-bezier(0.4, 0, 0.2, 1)'
  		}
```

**Verification:**
```bash
npm run lint && npm run typecheck && npm test
npx tailwindcss -i src/app/globals.css -o /tmp/tw-check.css --content './src/app/page.tsx' 2>&1 | tail -3
```
The config must compile without warnings.

**Commit:** `feat(design): register card-enter/shimmer keyframes and easing tokens`

---

### Task 2: Reduced-motion policy + skeleton bar component class

**Objective:** Make every animation this round adds opt-out under `prefers-reduced-motion`, and give skeletons a real shimmer surface.

**Files:**
- Modify: `src/app/globals.css`

**Steps:**

1. Append to the **end** of `src/app/globals.css` (after the existing closing `}` of the last `@layer base` block, at line 107):

```css
@layer components {
  /*
   * One bar of a loading skeleton: a muted block with a highlight sweeping
   * across it. The sweep is a ::after overlay rather than an opacity pulse on
   * the parent, so the card's border and layout stay perfectly still while
   * only the content placeholders move. Both colours are tokens, so the
   * shimmer reads in light mode (dark sweep on light gray) and in dark mode
   * (light sweep on dark gray) without a `dark:` variant.
   */
  .skeleton-bar {
    @apply relative overflow-hidden rounded bg-muted;
  }

  .skeleton-bar::after {
    content: '';
    @apply absolute inset-0;
    background-image: linear-gradient(
      90deg,
      transparent 0%,
      hsl(var(--foreground) / 0.07) 50%,
      transparent 100%
    );
    animation: shimmer 1.6s ease-in-out infinite;
  }
}

/*
 * Reduced-motion policy.
 *
 * Deliberately NOT the usual blanket `* { animation: none !important }`: that
 * also freezes `animate-spin`, and a motionless spinner reads as a hung
 * request rather than as a loading one. A small continuous rotation is the one
 * loop this app needs to keep its meaning, so it is left running. Everything
 * this round adds — entrances, shimmer, hover lifts, press scales — is
 * decoration and collapses to its end state instantly.
 *
 * The selectors are doubled (`.x.x`) purely to raise specificity above the
 * Tailwind utility of the same name. This block is intentionally unlayered and
 * last in the file so it also wins on source order.
 *
 * Per-utility opt-outs elsewhere use Tailwind's built-in `motion-safe:` /
 * `motion-reduce:` variants, which compile to this same media query.
 */
@media (prefers-reduced-motion: reduce) {
  .animate-card-enter.animate-card-enter,
  .animate-shimmer.animate-shimmer,
  .animate-pulse.animate-pulse {
    animation: none;
    opacity: 1;
    transform: none;
  }

  .skeleton-bar::after {
    animation: none;
    opacity: 0;
  }
}
```

**Verification:**
```bash
npm run lint && npm run typecheck && npm test
```
Then in DevTools → Rendering → *Emulate CSS prefers-reduced-motion: reduce*, confirm the block appears in the computed cascade and that `animate-spin` on `/jokes` still rotates.

**Commit:** `feat(design): reduced-motion policy and shimmer skeleton-bar class`

---

### Task 3: Stagger helper + tests

**Objective:** A pure, tested function for the entrance delay, so the stagger cap is enforced in one place rather than inlined into two grids.

**Files:**
- Create: `src/lib/motion.ts`
- Create: `src/lib/motion.test.ts`

**Steps:**

1. Create `src/lib/motion.ts`:

```ts
/** Milliseconds between consecutive cards in a staggered grid entrance. */
export const STAGGER_STEP_MS = 40;

/**
 * How many cards get a distinct delay before the stagger flattens out.
 *
 * A page of jokes can be 20+ cards; at 40ms apiece an uncapped stagger would
 * make the last card wait most of a second after the first, which reads as a
 * slow page rather than a lively one. Past the cap every remaining card shares
 * the final delay and enters together.
 */
export const MAX_STAGGERED_ITEMS = 12;

/**
 * Entrance delay for the card at `index` in a grid.
 *
 * Defensive against the two things a caller can get wrong: a negative index
 * (clamped to 0, never a negative `animation-delay`, which CSS treats as
 * "already partly played") and a non-integer index from an odd map.
 */
export function entranceDelayMs(index: number): number {
  if (!Number.isFinite(index) || index <= 0) return 0;
  const position = Math.min(Math.floor(index), MAX_STAGGERED_ITEMS - 1);
  return position * STAGGER_STEP_MS;
}
```

2. Create `src/lib/motion.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

import { entranceDelayMs, MAX_STAGGERED_ITEMS, STAGGER_STEP_MS } from '@/lib/motion';

describe('entranceDelayMs', () => {
  it('gives the first card no delay', () => {
    expect(entranceDelayMs(0)).toBe(0);
  });

  it('steps by STAGGER_STEP_MS for each following card', () => {
    expect(entranceDelayMs(1)).toBe(STAGGER_STEP_MS);
    expect(entranceDelayMs(2)).toBe(2 * STAGGER_STEP_MS);
    expect(entranceDelayMs(5)).toBe(5 * STAGGER_STEP_MS);
  });

  it('caps the delay so a long page does not trail off', () => {
    const cap = (MAX_STAGGERED_ITEMS - 1) * STAGGER_STEP_MS;
    expect(entranceDelayMs(MAX_STAGGERED_ITEMS - 1)).toBe(cap);
    expect(entranceDelayMs(MAX_STAGGERED_ITEMS)).toBe(cap);
    expect(entranceDelayMs(500)).toBe(cap);
  });

  it('never returns a negative delay', () => {
    expect(entranceDelayMs(-1)).toBe(0);
    expect(entranceDelayMs(-999)).toBe(0);
  });

  it('tolerates a non-integer index', () => {
    expect(entranceDelayMs(2.9)).toBe(2 * STAGGER_STEP_MS);
  });

  it('tolerates NaN', () => {
    expect(entranceDelayMs(Number.NaN)).toBe(0);
  });
});
```

**Verification:**
```bash
npm run lint && npm run typecheck && npm test
```
Test count must go **152 → 158**.

**Commit:** `feat(design): add tested entrance-stagger helper`

---

### Task 4: Card entrance animation on `JokeListItem`

**Objective:** Put the entrance on the card itself, not on a wrapper — a wrapper `<div>` would become the grid item and break the equal-height stretch the grid gives the `Card` today.

**Files:**
- Modify: `src/components/joke-list-item.tsx`

**Steps:**

1. Replace the import block and the props interface (`src/components/joke-list-item.tsx:1-19`) with:

```tsx

"use client";

import type { FC } from 'react';
import { format } from 'date-fns';
import { CalendarDays } from 'lucide-react'; // Removed UserCircle
import Link from 'next/link';

import type { Joke } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import StarRating from '@/components/StarRating';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { entranceDelayMs } from '@/lib/motion';
import { cn } from '@/lib/utils';

interface JokeListItemProps {
  joke: Joke;
  /**
   * Position in the grid. Drives the staggered entrance delay; omit it (the
   * home page's three-card teaser, a one-off render) and the card simply
   * enters with no delay.
   *
   * The animation is a CSS mount animation, so it plays exactly when React
   * inserts the node. Cards are keyed by `joke.id`, so a "Load More" append
   * leaves existing cards untouched and only the new page animates.
   */
  index?: number;
}
```

2. Replace the component signature and the `<Card>` opening tag (`:21-30`) with:

```tsx
const JokeListItem: FC<JokeListItemProps> = ({ joke, index }) => {
  const { user: currentUser } = useAuth();

  const isOwner = currentUser?.uid === joke.userId;

  return (
    <Card
      style={index === undefined ? undefined : { animationDelay: `${entranceDelayMs(index)}ms` }}
      className={cn(
        "animate-card-enter flex flex-col shadow-lg hover:shadow-xl transition-shadow duration-300 rounded-lg overflow-hidden border-primary/20",
        joke.used && isOwner ? "bg-muted/30" : "bg-card"
    )}>
```

(The `shadow-lg`/`hover:shadow-xl` pair is left alone here — Task 13 owns elevation, and it has to change the skeleton in the same commit.)

**Verification:**
```bash
npm run lint && npm run typecheck && npm test
npm run dev
```
Load `/jokes`: cards fade+rise in. Click "Load More": the existing cards **must not** re-animate; only the appended page does. Toggle *Emulate prefers-reduced-motion: reduce* → cards appear instantly, fully opaque.

**Commit:** `feat(design): staggered mount animation on joke cards`

---

### Task 5: Pass the stagger index from both grids

**Objective:** Wire the index at the two call sites.

**Files:**
- Modify: `src/components/joke-list.tsx`
- Modify: `src/app/page.tsx`

**Steps:**

1. In `src/components/joke-list.tsx`, replace the grid (`:31-37`) with:

```tsx
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 py-6">
      {jokes.map((joke, index) => (
        <JokeListItem key={joke.id} joke={joke} index={index} />
      ))}
    </div>
  );
```

2. In `src/app/page.tsx`, replace the teaser grid (`:71-75`) with:

```tsx
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5 md:gap-6 max-w-5xl mx-auto">
            {displayedJokes.map((joke, index) => (
              <JokeListItem key={joke.id} joke={joke} index={index} />
            ))}
          </div>
```

**Verification:**
```bash
npm run lint && npm run typecheck && npm test
```
On `/jokes`, cards 1–12 enter 40ms apart and 13+ enter together with card 12. On `/`, the three teaser cards enter 0/40/80ms apart. Apply a filter: the whole grid re-animates (new keys) — the skeleton is still shown for the fetch, and the `loadedFilters` guard is untouched.

**Commit:** `feat(design): stagger joke-card entrances in both grids`

---

### Task 6: Hover lift, press state and focus-visible on joke cards

**Objective:** Give the card the three states it's missing, and stop leaving a focus ring after a mouse click (**V8**).

**Files:**
- Modify: `src/components/joke-list-item.tsx`

**Steps:**

1. Replace the `<Card>` opening tag written in Task 4 with:

```tsx
    <Card
      style={index === undefined ? undefined : { animationDelay: `${entranceDelayMs(index)}ms` }}
      className={cn(
        "animate-card-enter flex flex-col rounded-lg overflow-hidden border-primary/20",
        // `:active` propagates from the pressed <Link> up to this ancestor in
        // every browser, so the card settles under the press without needing
        // any state. Transform work is `motion-safe:` only; the shadow and
        // border transitions are cheap enough to keep for everyone.
        "shadow-lg transition-[box-shadow,border-color,transform] duration-200 ease-standard",
        "hover:shadow-xl hover:border-primary/40",
        "motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0 active:shadow-md",
        joke.used && isOwner ? "bg-muted/30" : "bg-card"
    )}>
```

2. Replace the `<Link>` className (`:32`) with:

```tsx
            className="block flex-grow flex flex-col hover:bg-accent/20 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded-t-lg">
```

(`focus:` → `focus-visible:`, and `focus:ring-primary` → the `--ring` token, which is what every `Button` uses.)

**Verification:**
```bash
npm run lint && npm run typecheck && npm test
```
Hover a card: it lifts 2px and the border warms. Press and hold: it settles back down. Tab to a card: ring appears. Click a card with the mouse and navigate back: **no** lingering ring. With reduced motion: shadow and border still respond, no translation.

**Commit:** `feat(design): hover lift, press state and focus-visible ring on joke cards`

---

### Task 7: Press feedback on every button

**Objective:** One press affordance for the whole app, in `buttonVariants` (**M3**).

**Files:**
- Modify: `src/components/ui/button.tsx`

**Steps:**

1. Replace the `cva` base string (`src/components/ui/button.tsx:8`) with:

```ts
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-standard motion-safe:active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
```

Changes from the current string, and only these: `transition-colors` → an explicit property list that includes `transform`; `duration-150 ease-standard` pinned; `motion-safe:active:scale-[0.97]` added. `disabled:pointer-events-none` already prevents `:active` on disabled buttons.

**Verification:**
```bash
npm run lint && npm run typecheck && npm test
```
Press any button (nav items, "Apply Filters", "Load More Jokes", star buttons): it dips ~3%. Disabled buttons do not react. With reduced motion: colour transitions still run, no scale. Confirm `asChild` buttons (`<Button asChild><Link/></Button>` on the home page) get it too — the class lands on the `<Link>` via `Slot`.

**Commit:** `feat(design): press-scale feedback on all buttons`

---

### Task 8: StarRating hover preview and press feedback

**Objective:** Show the value you're about to pick before you pick it (**M4**). No change to when `onRatingChange` fires.

**Files:**
- Modify: `src/components/StarRating.tsx`
- Modify: `src/components/joke/RatingForm.tsx`

**Steps:**

1. Replace `src/components/StarRating.tsx:1-6` with:

```tsx
"use client";

import { useState, type FC } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
```

2. Replace the component body from `const StarRating: FC<StarRatingProps> = ({` through the closing `};` (`:48-115`) with:

```tsx
const StarRating: FC<StarRatingProps> = ({
  rating,
  onRatingChange,
  maxStars = 5,
  size = 20,
  className,
  starClassName = 'text-primary',
  disabled = false,
  readOnly = false,
}) => {
  // The value under the cursor or keyboard focus, or `null` for "no preview,
  // show the committed rating". Held unconditionally — hooks cannot sit below
  // the read-only early return — and simply never set in read-only mode.
  const [hoverRating, setHoverRating] = useState<number | null>(null);

  const isInteractive = !readOnly && !disabled;

  const handleStarClick = (index: number) => {
    if (!readOnly && onRatingChange && !disabled) {
      onRatingChange(index + 1);
    }
  };

  const previewStar = (starValue: number | null) => {
    if (!isInteractive) return;
    setHoverRating(starValue);
  };

  // Interactive stars render the previewed value so you can see four stars
  // before committing to four stars. Falls back to the committed rating the
  // moment the pointer or focus leaves.
  const displayedValue = isInteractive ? hoverRating ?? rating : rating;

  // Fraction of each star covered by the displayed value.
  const fillPercents = Array.from({ length: maxStars }, (_, i) =>
    Math.min(Math.max(displayedValue - i, 0), 1) * 100
  );

  if (readOnly) {
    // A read-only rating is one value, not `maxStars` controls: five buttons
    // meant a screen reader announced "Filled star 1 of 5, Filled star 2 of
    // 5, …" on every card in the grid. One `role="img"` with the value in its
    // label says the same thing once, and matches what the fractional fill
    // actually renders.
    const displayRating = Math.round(Math.min(Math.max(rating, 0), maxStars) * 10) / 10;
    return (
      <div
        role="img"
        aria-label={`${displayRating} out of ${maxStars} stars`}
        className={cn('flex items-center space-x-0.5', className)}
      >
        {fillPercents.map((fillPercent, i) => (
          <StarGlyph key={i} fillPercent={fillPercent} size={size} starClassName={starClassName} />
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn('flex items-center space-x-0.5', className)}
      onMouseLeave={() => previewStar(null)}
    >
      {fillPercents.map((fillPercent, i) => (
        <Button
          key={i}
          type="button" // ensure it does not submit forms if nested
          variant="ghost"
          size="icon"
          className={cn(
            'p-0 h-auto w-auto', // remove default button padding and size constraints
            // `buttonVariants` pins every nested svg to `size-4`, which would
            // silently ignore the `size` prop; `size-auto` hands sizing back to
            // the width/height attributes lucide renders.
            '[&_svg]:size-auto',
            // The base button already transitions `transform` and dips on
            // press; stars additionally grow a little under the cursor so the
            // one you are aiming at is unambiguous.
            isInteractive && 'motion-safe:hover:scale-110 motion-safe:focus-visible:scale-110',
            disabled ? 'cursor-default' : 'cursor-pointer',
            starClassName
          )}
          onClick={() => handleStarClick(i)}
          onMouseEnter={() => previewStar(i + 1)}
          onFocus={() => previewStar(i + 1)}
          onBlur={() => previewStar(null)}
          disabled={disabled}
          aria-label={`Set rating to ${i + 1} stars`}
        >
          <StarGlyph fillPercent={fillPercent} size={size} starClassName={starClassName} />
        </Button>
      ))}
    </div>
  );
};
```

3. In `src/components/joke/RatingForm.tsx`, replace `:62` with:

```tsx
                  starClassName="text-primary"
```

The old `hover:text-primary/70` dimmed the single hovered star, which now fights the preview fill and reads as "disabled".

**Verification:**
```bash
npm run lint && npm run typecheck && npm test
```
On a joke detail page while signed in: hover the 4th star → four stars fill and that star grows; move away → the fill snaps back to your committed rating. Tab through the stars → the same preview follows focus. Click → `onRatingChange(4)` fires exactly as before, the Submit button enables as before. Read-only stars on cards are unchanged (still one `role="img"`, no hover behaviour). With reduced motion: preview fill still works, no scaling.

**Commit:** `feat(design): star-rating hover/focus preview and press feedback`

---

### Task 9: Skeleton shimmer polish

**Objective:** Replace the whole-card opacity blink with a per-bar sweep (**M6**), keeping the skeleton's outline perfectly still.

**Files:**
- Modify: `src/app/jokes/page.tsx`

**Steps:**

1. Replace `JokeGridSkeleton` (`src/app/jokes/page.tsx:25-54`) with:

```tsx
function JokeGridSkeleton() {
  return (
    // ARIA has no author-supplied name for a role-less <div> (role=generic), so
    // the announcement rides on role="status" plus visually hidden text.
    <div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 py-6"
      role="status"
      aria-busy="true"
    >
      <span className="sr-only">Loading jokes…</span>
      {Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => (
        // The card chrome here mirrors `JokeListItem` exactly so the swap from
        // skeleton to content does not shift anything. The shimmer lives on
        // the bars (`.skeleton-bar`), not on the card, so the border and the
        // layout stay still while only the placeholders move.
        <div
          key={index}
          className="flex flex-col rounded-lg border border-primary/20 bg-card shadow-lg overflow-hidden"
        >
          <div className="p-5 flex-grow space-y-2">
            <div className="skeleton-bar h-3 w-full" />
            <div className="skeleton-bar h-3 w-11/12" />
            <div className="skeleton-bar h-3 w-3/4" />
            <div className="skeleton-bar h-5 w-20 rounded-md mt-6" />
          </div>
          <div className="p-4 border-t border-border/50 flex items-center justify-between">
            <div className="skeleton-bar h-3 w-24" />
            <div className="skeleton-bar h-3 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}
```

Only `animate-pulse` on the card and `bg-muted`/`rounded` on the bars changed; `role`, `aria-busy`, the `sr-only` text, `SKELETON_CARD_COUNT` and every layout class are byte-identical.

**Verification:**
```bash
npm run lint && npm run typecheck && npm test
```
Throttle the network and reload `/jokes`: a highlight sweeps left-to-right across each bar, the card border does not throb. Apply a filter: skeletons return, chrome stays mounted, scroll position holds (unchanged from before). With reduced motion: bars are static muted blocks, `aria-busy`/`sr-only` still announce.

**Commit:** `feat(design): shimmer sweep on joke grid skeletons`

---

### Task 10: Align dialog and popover transition timing

**Objective:** Stop the overlay and the panel finishing 50ms apart (**M5**).

**Files:**
- Modify: `src/components/ui/dialog.tsx`
- Modify: `src/components/ui/popover.tsx`

**Steps:**

1. In `src/components/ui/dialog.tsx`, replace the `DialogOverlay` className (`:23-26`) with:

```tsx
    className={cn(
      // `duration-200` matches DialogContent below. Without it the overlay
      // falls back to tailwindcss-animate's 150ms default and finishes fading
      // before the panel has finished leaving.
      "fixed inset-0 z-50 bg-black/80 duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
```

2. In `src/components/ui/popover.tsx`, replace the `PopoverContent` className (`:21-24`) with:

```tsx
      className={cn(
        "z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none duration-150 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className
      )}
```

**Verification:**
```bash
npm run lint && npm run typecheck && npm test
```
Open and close the Filters dialog on `/jokes`: overlay and panel now leave together. Open the category combobox inside it and in the add-joke form: still opens/closes, `w-[--radix-popover-trigger-width]` sizing unaffected. Everything remains a Radix `data-[state]` animation, so `prefers-reduced-motion` is handled by the Task 2 `.animate-*` overrides.

**Commit:** `fix(design): align dialog overlay and popover transition durations`

---

### Task 11: Theme toggle icon transition and anchoring

**Objective:** Make the sun/moon swap deliberate, and stop the Moon icon depending on there being no positioned ancestor (**M7**).

**Files:**
- Modify: `src/components/theme-toggle.tsx`

**Steps:**

1. Replace the `<Button>` block (`src/components/theme-toggle.tsx:21-27`) with:

```tsx
      <DropdownMenuTrigger asChild>
        {/*
          `relative` is load-bearing: the Moon below is absolutely positioned
          and, without a positioned ancestor here, resolves against the sticky
          <nav>. It happens to land correctly today only because an all-`auto`
          absolute box stays at its static position — one stray `relative`
          upstream and the icon flies across the header.
        */}
        <Button variant="ghost" size="sm" className="relative px-2 text-foreground hover:bg-accent/50 hover:text-accent-foreground">
          <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 text-primary transition-transform duration-300 ease-emphasized motion-reduce:transition-none dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 text-primary transition-transform duration-300 ease-emphasized motion-reduce:transition-none dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
```

`transition-all` → `transition-transform` (the only animated properties are `rotate` and `scale`; `transition-all` was also transitioning colour, which `disableTransitionOnChange` suppresses anyway), plus an explicit duration/easing and a reduced-motion opt-out.

> **Note for the implementer:** do **not** remove `disableTransitionOnChange` from `src/app/layout.tsx:44` to get a page-wide colour crossfade. That flag exists to prevent a transition flash on hydration; see the deferral list at the top of this plan.

**Verification:**
```bash
npm run lint && npm run typecheck && npm test
```
Toggle Light → Dark → System: the sun rotates out and the moon rotates in over 300ms, in place, with no page-colour transition flash on reload. With reduced motion: icons swap instantly.

**Commit:** `fix(design): anchor and refine the theme-toggle icon transition`

---

### Task 12: Dark-mode surface separation

**Objective:** Give dark mode an actual card plane (**V2**). Token-only change; no component touches.

**Files:**
- Modify: `src/app/globals.css`

**Steps:**

1. In the `.dark` block of `src/app/globals.css`, replace lines `55-71` with:

```css
    --background: 0 0% 10%;
    --foreground: 0 0% 98%;

    /* Cards and popovers sit *above* the page in dark mode. They used to share
       `0 0% 10%` with --background, and box-shadows are invisible on near
       black, so every card was separated from the page by nothing but its
       border. Lightness is the only separation channel that works down here. */
    --card: 0 0% 13%;
    --card-foreground: 0 0% 98%;

    --popover: 0 0% 13%;
    --popover-foreground: 0 0% 98%;

    --primary: 270 60% 65%; /* Brighter Purple for dark mode */
    --primary-foreground: 0 0% 10%; /* Dark text on brighter purple */

    --secondary: 0 0% 25%;
    --secondary-foreground: 0 0% 98%;

    /* One step above --card, so `bg-muted` blocks (skeleton bars, comment
       bubbles, the "used" card tint) read as recessed content on a card
       rather than as holes punched through to the page. */
    --muted: 0 0% 18%;
    --muted-foreground: 0 0% 63.9%;
```

**Verification:**
```bash
npm run lint && npm run typecheck && npm test
```
In dark mode: joke cards on `/jokes` are visibly lighter than the page; the Filters dialog and the category popover read as floating surfaces; skeleton bars are visible against the card; a joke marked "used" (`bg-muted/30`) is still distinguishable from an unused one. Contrast: `--muted-foreground` `0 0% 63.9%` on `--card` `0 0% 13%` ≈ 8.0:1 and on `--muted` `0 0% 18%` ≈ 7.0:1 — both clear AA for body text. Light mode is untouched.

**Commit:** `fix(design): give dark mode a distinct card/popover/muted surface`

---

### Task 13: One elevation scale

**Objective:** Reserve heavy shadows for things that actually float (**V1**). **The skeleton and the real card must change together** (constraint 3).

**Files:**
- Modify: `src/components/joke-list-item.tsx`
- Modify: `src/app/jokes/page.tsx`
- Modify: `src/components/joke/RatingForm.tsx`
- Modify: `src/components/joke/CommunityRatings.tsx`
- Modify: `src/components/joke/ExplanationCard.tsx`
- Modify: `src/app/auth/page.tsx`

**The scale** (record it in the `globals.css` comment added in Task 14):
| Surface | Class |
|---|---|
| In-flow content card (grid item, detail-page section) | `shadow-sm` |
| The same card, hovered | `hover:shadow-md` |
| Genuinely floating (dialog, popover, dropdown, toast) | `shadow-lg` — already correct, untouched |
| Standalone focal card (auth) | `shadow-md` |

**Steps:**

1. `src/components/joke-list-item.tsx` — in the `<Card>` className from Task 6, replace `"shadow-lg transition-…"` / `"hover:shadow-xl hover:border-primary/40"` / `active:shadow-md` with:

```tsx
        "shadow-sm transition-[box-shadow,border-color,transform] duration-200 ease-standard",
        "hover:shadow-md hover:border-primary/40",
        "motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0 active:shadow-sm",
```

2. `src/app/jokes/page.tsx` — in `JokeGridSkeleton`, change the skeleton card's `shadow-lg` to `shadow-sm` so it still mirrors the real card:

```tsx
          className="flex flex-col rounded-lg border border-primary/20 bg-card shadow-sm overflow-hidden"
```

3. `src/components/joke/RatingForm.tsx:39` → `<Card className="shadow-sm mb-8">`
4. `src/components/joke/CommunityRatings.tsx:25` → `<Card className="shadow-sm">`
5. `src/components/joke/ExplanationCard.tsx:25` → `<Card className="shadow-sm mb-8 bg-accent/50 border-primary/20">`
6. `src/app/auth/page.tsx:88` → `<Card className="w-full max-w-md shadow-md">`

**Verification:**
```bash
npm run lint && npm run typecheck && npm test
grep -rn "shadow-lg\|shadow-xl" src/components/joke-list-item.tsx src/app/jokes/page.tsx src/components/joke src/app/auth
```
The grep must return nothing. Reload `/jokes` mid-fetch and watch the skeleton→content swap: **no shadow pop**. The Filters dialog and the dropdown menus still read as floating above the now-quieter page.

**Commit:** `fix(design): single elevation scale across cards and skeletons`

---

### Task 14: One typography scale

**Objective:** Collapse five heading scales into one, documented in the stylesheet (**V3**).

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/components/header.tsx`
- Modify: `src/app/jokes/page.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/components/joke/JokeHeader.tsx`

**The scale:**
| Role | Classes |
|---|---|
| Page title (h1) | `text-3xl font-bold tracking-tight sm:text-4xl` |
| Page description | `text-base text-muted-foreground sm:text-lg` |
| Section title (h2) | `text-2xl font-semibold tracking-tight` |
| Card title | `text-lg font-semibold` (ShadCN default `text-2xl` is always overridden — leave `ui/card.tsx` alone, override at the call site as today) |
| Body | `text-sm leading-relaxed` |

**Steps:**

1. Append to the documentation comment area of `src/app/globals.css` — put this immediately **before** the closing `}` of the second `@layer base` block (after the `body` rule at `:104-106`):

```css
  /*
   * Type scale (round 4). One scale, applied at call sites — deliberately not
   * component classes, so the utilities stay greppable and Tailwind can still
   * see every variant.
   *
   *   Page title (h1)    text-3xl font-bold tracking-tight sm:text-4xl
   *   Page description   text-base text-muted-foreground sm:text-lg
   *   Section title (h2) text-2xl font-semibold tracking-tight
   *   Card title         text-lg font-semibold
   *   Body               text-sm leading-relaxed
   *
   * Elevation scale (round 4):
   *   in-flow card       shadow-sm  (hover: shadow-md)
   *   floating surface   shadow-lg  (dialog, popover, dropdown, toast)
   *   focal card         shadow-md  (auth)
   *
   * Page container (round 4):
   *   container mx-auto px-4 py-8 sm:px-6 md:py-12
   */
```

2. Replace `src/components/header.tsx` entirely:

```tsx

import type { FC } from 'react';

interface HeaderProps {
  title: string;
  /** Optional one-line description rendered under the title. */
  description?: string;
  /** Centre the block; the default is left-aligned. */
  centered?: boolean;
}

const Header: FC<HeaderProps> = ({ title, description, centered = false }) => {
  return (
    <header className={centered ? 'mb-8 text-center' : 'mb-8'}>
      <h1 className="text-3xl font-bold tracking-tight text-primary sm:text-4xl">{title}</h1>
      {description && (
        <p className="mt-3 text-base text-muted-foreground sm:text-lg">{description}</p>
      )}
    </header>
  );
};

export default Header;
```

3. In `src/app/jokes/page.tsx`, replace the page header (`:137-140`) with the shared component:

```tsx
      <Header title={pageTitle} description={pageDescription} centered />
```

and add the import alongside the others near `:13`:

```tsx
import Header from '@/components/header';
```

4. In `src/app/page.tsx`, replace the section heading (`:62-64`) with:

```tsx
        <h2 className="text-2xl font-semibold tracking-tight text-primary mb-10">
          A Taste of Humor
        </h2>
```

5. In `src/components/joke/JokeHeader.tsx`, replace `:26-28` with:

```tsx
      {/* This h1 is the joke itself, which can run to several sentences —
          smaller than a page title on purpose, with tighter leading. */}
      <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-4 leading-snug">
        {joke.text}
      </h1>
```

**Verification:**
```bash
npm run lint && npm run typecheck && npm test
```
`/jokes`, `/add-joke` and `/manage` now share one title treatment and one spacing (`mb-8`). No h2 anywhere is larger than an h1. A long joke on the detail page no longer fills the viewport. Confirm the `/jokes` header is still centred and still shows both strings.

**Commit:** `refactor(design): one typography scale via a shared page Header`

---

### Task 15: Spacing rhythm and page breathing room

**Objective:** One page container, and reclaim the ~7rem hole above the fold on the home page (**V4**, **V6**).

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/jokes/page.tsx`
- Modify: `src/app/joke/[jokeId]/page.tsx`
- Modify: `src/app/add-joke/page.tsx`
- Modify: `src/app/manage/page.tsx`

**Canonical container:** `container mx-auto px-4 py-8 sm:px-6 md:py-12` (plus any existing `max-w-*`).

**Steps:**

1. `src/app/page.tsx` — replace `:53-59` with:

```tsx
    <div className="container mx-auto px-4 py-8 sm:px-6 md:py-12 text-center">
      <header className="mb-12 sm:mb-16">
        <Logo width={400} className="mx-auto mb-5" />
        <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto">
          Your personal space to collect, create, and cherish every chuckle. Dive in and let the laughter begin!
        </p>
      </header>
```

(The tagline's own `mb-16` is dropped — the `<header>` already owns the gap — and it drops to the documented description scale.)

2. `src/app/page.tsx` — replace the footer (`:116`) with:

```tsx
      <footer className="mt-16 pt-10 border-t border-border/30">
```

3. `src/app/jokes/page.tsx` — replace the outer container (`:136`) with:

```tsx
    <div className="container mx-auto px-4 py-8 sm:px-6 md:py-12">
```

Apply the same replacement to the two loading containers in that file (`:128`, `:217`), keeping their `flex flex-col justify-center items-center min-h-[calc(100vh-8rem)]` suffix.

4. `src/app/joke/[jokeId]/page.tsx` — replace every `container mx-auto p-4 md:p-8 max-w-3xl` (`:304`, `:327`, `:344`) with:

```tsx
    <div className="container mx-auto px-4 py-8 sm:px-6 md:py-12 max-w-3xl">
```

and the loading container (`:295`) with `container mx-auto px-4 py-8 sm:px-6 md:py-12 flex flex-col justify-center items-center min-h-[calc(100vh-8rem)]`.

5. `src/app/add-joke/page.tsx` (`:143`, `:152`, `:174`, `:182`) and `src/app/manage/page.tsx` (`:35`, `:46`, `:54`) — same substitution: `p-4 md:p-8` → `px-4 py-8 sm:px-6 md:py-12`.

**Verification:**
```bash
npm run lint && npm run typecheck && npm test
grep -rn "p-4 md:p-8\|py-10 sm:py-16" src/app
```
The grep must return nothing. At 375px width every page has a 1rem gutter and consistent vertical rhythm; at ≥640px, 1.5rem. On the home page "A Taste of Humor" is visible without scrolling on a phone.

**Commit:** `fix(design): one page container and tighter home-page rhythm`

---

### Task 16: Make the `/jokes` filter bar wrap on mobile

**Objective:** Fix the non-wrapping toolbar (**V7**) and the `p-4`/`pb-6` padding conflict.

**Files:**
- Modify: `src/app/jokes/page.tsx`

**Steps:**

1. Replace the filter-bar wrapper (`src/app/jokes/page.tsx:142`) with:

```tsx
      {/* Wraps on narrow screens: the trigger buttons, the active-filter badges
          and the action cluster each take a full row rather than being crushed
          into one. `p-4` was fighting `pb-6` on the same edge — the bottom
          padding is the one that matters, since it sets the gap to the rule. */}
      <div className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-3 border-b pb-6">
```

2. Replace the action cluster (`:166`) with:

```tsx
        <div className="flex w-full items-center justify-end sm:w-auto sm:ml-auto">
```

3. Replace the badge row (`:145`) with:

```tsx
        <div className="flex flex-wrap items-center gap-2 flex-grow basis-full sm:basis-auto min-h-[36px]">
```

**Verification:**
```bash
npm run lint && npm run typecheck && npm test
```
At 375px, signed out, with a search and two categories applied: the Search/Filters buttons sit on row 1, the badges wrap onto row 2, and the full-width "Log in to Add Jokes" button sits on row 3 with "Clear All" beside it — nothing overflows horizontally (`document.documentElement.scrollWidth === clientWidth`). At ≥640px the layout is identical to today.

**Commit:** `fix(design): wrap the /jokes filter bar on mobile`

---

### Task 17: Real empty states

**Objective:** Give the three empty states a shape instead of grey text (**V5**). Icon + copy only — no CTAs, per the deferral note.

**Files:**
- Create: `src/components/EmptyState.tsx`
- Modify: `src/components/joke-list.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/components/joke/CommunityRatings.tsx`

**Steps:**

1. Create `src/components/EmptyState.tsx`:

```tsx
import type { FC, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

interface EmptyStateProps {
  /** Lucide icon rendered in the token-tinted disc. */
  icon: LucideIcon;
  /** The headline — one sentence, stating what is not here. */
  title: string;
  /** Optional second line saying what to do about it. */
  hint?: ReactNode;
  className?: string;
  /** `sm` for empty states nested inside a card. */
  size?: 'default' | 'sm';
}

/**
 * Shared "nothing here" block: an icon in a tinted disc, a headline in
 * foreground weight, and a muted hint. Presentational only — it carries no
 * actions, because the three current call sites each sit somewhere that would
 * need different wiring, and a wrong action is worse than none.
 */
const EmptyState: FC<EmptyStateProps> = ({ icon: Icon, title, hint, className, size = 'default' }) => {
  const isSmall = size === 'sm';

  return (
    <div className={cn('text-center', isSmall ? 'py-6' : 'py-12', className)}>
      <div
        className={cn(
          'mx-auto mb-4 flex items-center justify-center rounded-full bg-accent text-accent-foreground',
          isSmall ? 'h-10 w-10' : 'h-14 w-14'
        )}
      >
        <Icon className={isSmall ? 'h-5 w-5' : 'h-7 w-7'} aria-hidden="true" />
      </div>
      <p className={cn('font-medium text-foreground', isSmall ? 'text-sm' : 'text-lg')}>{title}</p>
      {hint && <p className="mt-1.5 text-sm text-muted-foreground max-w-md mx-auto">{hint}</p>}
    </div>
  );
};

export default EmptyState;
```

2. In `src/components/joke-list.tsx`, replace the imports (`:7-8`) and the empty branch (`:19-29`) with:

```tsx
import JokeListItem from './joke-list-item';
import EmptyState from './EmptyState';
import { Laugh } from 'lucide-react';
```

```tsx
const JokeList: FC<JokeListProps> = ({ jokes, emptyMessage, emptyHint }) => {
  if (jokes.length === 0) {
    return (
      <EmptyState
        icon={Laugh}
        title={emptyMessage ?? 'No jokes found.'}
        hint={emptyHint ?? 'Try adding some or adjusting your filters!'}
      />
    );
  }
```

The `emptyMessage`/`emptyHint` props keep their exact meaning, so the search-exhaustion copy built in `jokes/page.tsx:96-105` is unchanged.

3. In `src/app/page.tsx`, replace the empty branch (`:76-80`) with:

```tsx
        ) : (
          <EmptyState
            icon={Laugh}
            title="No sample jokes to display right now."
            hint="Check back soon — or sign in and add the first one."
          />
        )}
```

and extend the imports at `:10-12`:

```tsx
import { ArrowRight, Laugh, Loader2, PlusCircle } from 'lucide-react';
import JokeListItem from '@/components/joke-list-item';
import EmptyState from '@/components/EmptyState';
import Logo from '@/components/logo';
```

4. In `src/components/joke/CommunityRatings.tsx`, replace the imports (`:3-9`) and the empty branch (`:48-49`):

```tsx
import { format } from 'date-fns';
import { Loader2, MessageSquareOff } from 'lucide-react';

import type { UserRating } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import StarRating from '@/components/StarRating';
import EmptyState from '@/components/EmptyState';
import { Separator } from '@/components/ui/separator';
```

```tsx
                {otherUserRatingsToDisplay.length === 0 ? (
                    <EmptyState
                      size="sm"
                      icon={MessageSquareOff}
                      title={allUserRatings.length > 0 ? 'No other community feedback yet.' : 'No community feedback yet.'}
                      hint={allUserRatings.length > 0 ? undefined : 'Be the first to rate this one.'}
                    />
                ) : (
```

**Verification:**
```bash
npm run lint && npm run typecheck && npm test
```
`/jokes?search=zzzzzz` → icon disc + "No jokes matched “zzzzzz”." + the exhaustion hint, wording unchanged from today. A joke with no ratings → the small variant inside the card, not overpowering it. Check both themes: the `bg-accent` disc reads on light (pastel purple) and on dark (`270 50% 25%`).

**Commit:** `feat(design): shared EmptyState across list, home and community ratings`

---

### Task 18: Lock it in — docs and full-round verification

**Objective:** Record the round and prove the whole diff is green.

**Files:**
- Modify: `context/PROJECT_PROGRESS.md`
- Modify: `context/PROJECT_CONTEXT_HISTORY.md` (§Styling Guidelines — append the type, elevation, container and motion scales)

**Steps:**

1. Add a `## DONE (2026-08-18, design round 4)` section to `context/PROJECT_PROGRESS.md` listing: motion tokens + reduced-motion policy, staggered card entrances, card hover/press/focus-visible, button press scale, star hover preview, shimmer skeletons, aligned dialog/popover timing, theme-toggle fix, dark-mode surfaces, one elevation scale, one type scale, one page container, mobile filter-bar wrapping, shared `EmptyState`.

2. Under it, record the **accepted deferrals** verbatim from the top of this plan: page-wide theme crossfade (blocked by `disableTransitionOnChange`, deliberate), empty-state CTAs (would be new behaviour), framer-motion left in place in `add-joke/page.tsx`.

3. Append the four scales (type, elevation, container, motion) to §Styling Guidelines in `context/PROJECT_CONTEXT_HISTORY.md`, cross-referencing the comment block in `src/app/globals.css`.

4. Full-round verification:

```bash
npm run lint && npm run typecheck && npm test && npx next build
git diff --stat $(git rev-parse HEAD~17)..HEAD
```

Then a manual pass with DevTools *Emulate prefers-reduced-motion: reduce* toggled on and off, in both themes, at 375px and 1440px, over: `/`, `/jokes`, `/jokes?search=zzzzzz`, `/joke/<id>`, `/add-joke`, `/manage`, `/auth`.

5. Confirm the three untouchables:
```bash
git diff HEAD~17 --stat -- src/contexts src/services src/lib/jokeFilters.ts src/hooks/useJokeFilters.ts
```
must be empty, and `filtersEqual` still guards both `page.tsx` and `jokes/page.tsx`.

**Commit:** `docs: record design round 4 (motion + visual system) and its deferrals`

---

## Review protocol (per task)

After each implementer run completes:
1. **Spec compliance review** (Claude Code, read-only): does the diff implement exactly the cited task, no more, no less? Did it change any file outside the task's **Files** list? PASS or gap list.
2. **Constraint review** (read-only): (a) no behaviour change — no new fetches, no new state feeding a fetch, no changed conditionals; (b) `loadedFilters` guard byte-identical; (c) skeleton chrome still mirrors `JokeListItem`; (d) every animation added has a reduced-motion path. APPROVED or REQUEST_CHANGES.
3. Gaps → dispatch a fix run → re-review. Proceed only on PASS + APPROVED.

## Final integration

After Task 18: one final Claude Code review of the whole round-4 diff (`git diff` across all 18 task commits), full baseline gate plus `npx next build`, then push `master` to origin (repo convention: direct push, no PRs).
