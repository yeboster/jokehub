
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
        joke.used && isOwner ? "bg-muted/30" : "bg-card"
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
      <CardFooter className="p-4 border-t border-border/50 flex items-center justify-between">
        {/* Left side: Date */}
        <div className="flex items-center flex-nowrap text-xs text-muted-foreground">
            <div className="flex items-center gap-1 flex-shrink-0">
                <CalendarDays className="h-4 w-4 mr-1" />
                {format(joke.dateAdded, 'PP')}
            </div>
        </div>

        {/* Right side: Average Rating */}
        <div className="flex items-center gap-2">
            {joke.ratingCount && joke.ratingCount > 0 ? (
                <TooltipProvider delayDuration={300}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="flex items-center gap-1 cursor-default">
                                <StarRating
                                    rating={joke.averageRating || 0}
                                    readOnly
                                    size={14}
                                    starClassName="text-primary"
                                    label={`Average rating ${(joke.averageRating || 0).toFixed(1)} out of 5, from ${joke.ratingCount} rating${joke.ratingCount === 1 ? '' : 's'}`}
                                />
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>Average rating: {(joke.averageRating || 0).toFixed(1)} from {joke.ratingCount} rating{joke.ratingCount === 1 ? '' : 's'}</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            ) : (
                <span className="text-xs text-muted-foreground italic">No ratings yet</span>
            )}
        </div>
      </CardFooter>
    </Card>
  );
};

export default JokeListItem;

