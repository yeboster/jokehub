
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
        "animate-card-enter flex flex-col shadow-lg hover:shadow-xl transition-shadow duration-300 rounded-lg overflow-hidden border-primary/20",
        joke.used && isOwner ? "bg-muted/30" : "bg-card"
    )}>
      <Link href={`/joke/${joke.id}`}
            className="block flex-grow flex flex-col hover:bg-accent/20 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 rounded-t-lg">
        <CardContent className="p-5 flex-grow cursor-pointer">
          <div className="relative h-full">
            <p className="text-sm text-foreground leading-relaxed pb-8">{joke.text}</p>
            <Badge
              variant="secondary"
              className="absolute bottom-0 left-0 bg-accent text-accent-foreground py-0.5 px-2 text-[11px] font-semibold rounded-md"
            >
              {joke.category}
            </Badge>
          </div>
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

