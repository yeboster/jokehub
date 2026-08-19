
"use client";

import type { FC } from 'react';
import { format } from 'date-fns';
import { CalendarDays, Check } from 'lucide-react';
import Link from 'next/link';

import type { Joke } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import StarRating from '@/components/StarRating';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { entranceDelayMs } from '@/lib/motion';
import { cn } from '@/lib/utils';

interface JokeListItemProps {
  joke: Joke;
  /**
   * Position of the card within the batch that is entering — which is its
   * position in the grid on a first load, but restarts at 0 for each page a
   * "Load More" appends. Drives the staggered entrance delay; omit it (the home
   * page's three-card teaser, a one-off render) and the card enters with no
   * delay.
   *
   * The animation is a CSS mount animation, so it plays exactly when React
   * inserts the node. Cards are keyed by `joke.id`, so a "Load More" append
   * leaves existing cards untouched and only the new page animates.
   */
  index?: number;
}

const JokeListItem: FC<JokeListItemProps> = ({ joke, index }) => {
  const { user: currentUser } = useAuth();

  const isOwner = currentUser?.uid === joke.userId;

  return (
    <Card
      style={index === undefined ? undefined : { animationDelay: `${entranceDelayMs(index)}ms` }}
      className={cn(
        "animate-card-enter flex flex-col rounded-lg overflow-hidden border-primary/20",
        // `:active` propagates from the pressed <Link> up to this ancestor in
        // every browser, so the card settles under the press without needing
        // any state. Transform work is `motion-safe:` only; the shadow and
        // border transitions are cheap enough to keep for everyone.
        //
        // The timing is spelled as arbitrary properties rather than
        // `duration-200 ease-standard`: tailwindcss-animate re-uses those two
        // utility names for `animation-duration` / `animation-timing-function`
        // and emits them *after* the `animate-*` utilities, so either class on
        // this element would silently retime the `animate-card-enter` entrance
        // above (320ms/emphasized → 200ms/standard). Arbitrary properties touch
        // the transition only. The easing reads the Task 1 token through
        // `theme()` rather than repeating its curve, so the round has one
        // definition of `standard`.
        //
        // Elevation scale (round 4): an in-flow content card rests at
        // `shadow-sm` and lifts one step on hover. Heavy shadows are reserved
        // for surfaces that genuinely float above the page.
        "shadow-sm transition-[box-shadow,border-color,transform] [transition-duration:200ms] [transition-timing-function:theme(transitionTimingFunction.standard)]",
        "hover:shadow-md hover:border-primary/40",
        "motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0 motion-safe:active:scale-[0.995]",
        // The `bg-muted/30` tint that used to mark a used joke is gone: it
        // composites to 1.03:1 against the card in light mode and 1.04:1 in
        // dark, so it marked nothing. The footer badge below does the job, in
        // text, for everyone.
        "bg-card"
    )}>
      <Link href={`/joke/${joke.id}`}
            className="block flex-grow flex flex-col hover:bg-accent/20 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded-t-lg">
        <CardContent className="flex flex-grow cursor-pointer flex-col gap-4 p-5">
          {/*
            `whitespace-pre-line`: a joke is written with its punchline on its
            own line, and every surface in this app collapsed that into one
            paragraph — while the AI's explanation and other users' comments
            both kept theirs (`whitespace-pre-wrap`). `pre-line` rather than
            `pre-wrap` because runs of spaces from a paste are noise, whereas
            the line breaks are the joke.

            `line-clamp-6`: a grid row is as tall as its tallest card, so one
            400-word bit left up to three neighbours as mostly whitespace. The
            full text is one click away, on a page built for it.

            `break-words`: a URL or a hashtag with no spaces in it cannot be
            broken by the normal rules and ran straight past the content box.
          */}
          <p className="line-clamp-6 whitespace-pre-line break-words text-sm leading-relaxed text-foreground">
            {joke.text}
          </p>
          {/*
            In the flow with `mt-auto`, not `absolute bottom-0 left-0`: the card
            is `overflow-hidden`, so a long category name was clipped mid-word
            with no ellipsis and no way to tell it had been. `mt-auto` pins it to
            the bottom, which is all the absolute positioning was for — and the
            `pb-8` that reserved space for it above is gone with it.

            `text-xs` replaces `text-[11px]`, which was the only arbitrary font
            size left in the app: the undocumented fifth type scale round 4 set
            out to delete. The truncating span is the pattern
            `CategoryCombobox` already uses; `min-w-0` is what lets a flex item
            shrink below its content width so the ellipsis can appear at all.
          */}
          <Badge
            variant="secondary"
            className="mt-auto max-w-full self-start rounded-md bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground"
          >
            <span className="min-w-0 truncate">{joke.category}</span>
          </Badge>
        </CardContent>
      </Link>
      <CardFooter className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border/50 p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1 whitespace-nowrap">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            {format(joke.dateAdded, 'PP')}
          </span>
          {/*
            The feed's only cue that a joke has already been told, and the
            reason the `usageStatus` filter exists. It was a `bg-muted/30` tint
            on the card — 1.03:1 in light mode, 1.04:1 in dark, computed — so
            for six rounds the flag was invisible on the feed and legible only
            on the detail page. Owner-only, because `used` is the owner's own
            bookkeeping and means nothing to anyone else.
          */}
          {joke.used && isOwner && (
            <Badge variant="outline" className="gap-1 px-1.5 py-0 text-xs font-medium">
              <Check className="h-3 w-3" aria-hidden="true" />
              Used
            </Badge>
          )}
        </div>

        {joke.ratingCount && joke.ratingCount > 0 ? (
          <div className="flex items-center gap-1.5">
            <StarRating
              rating={joke.averageRating || 0}
              readOnly
              size={14}
              starClassName="text-primary"
              label={`Average rating ${(joke.averageRating || 0).toFixed(1)} out of 5, from ${joke.ratingCount} rating${joke.ratingCount === 1 ? '' : 's'}`}
            />
            {/*
              The number and the count used to live in a `TooltipContent` whose
              trigger was a non-focusable div: unreachable by keyboard,
              unreachable by touch, and one `TooltipProvider` mounted per card
              (twelve per page, two hundred in a paged-in collection). As text
              they reach everyone. `aria-hidden` because `StarRating`'s label
              above already says both values — this is the same fact for eyes.
            */}
            <span className="text-xs text-muted-foreground" aria-hidden="true">
              {(joke.averageRating || 0).toFixed(1)} ({joke.ratingCount})
            </span>
          </div>
        ) : (
          <span className="text-xs italic text-muted-foreground">No ratings yet</span>
        )}
      </CardFooter>
    </Card>
  );
};

export default JokeListItem;

