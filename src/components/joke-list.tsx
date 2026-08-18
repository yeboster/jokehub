
"use client";

import { useState, type FC } from 'react';
import type { Joke } from '@/lib/types';
// Removed Table related imports
import JokeListItem from './joke-list-item';
import EmptyState from './EmptyState';
import { nextStaggerBatch, type StaggerBatch } from '@/lib/motion';
import { Laugh, RotateCcw, WifiOff } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { FeedEmptyCopy } from '@/lib/feedEmptyState';

interface JokeListProps {
  jokes: Joke[];
  /** What to say when there is nothing to show; omitted for a plain list. */
  emptyCopy?: FeedEmptyCopy;
  /** Wired to the empty state's "Clear filters" action when `emptyCopy` asks
   *  for one. */
  onClearFilters?: () => void;
  /** Wired to the empty state's "Try again" action when `emptyCopy` reports a
   *  failed fetch. Takes precedence over "Clear filters": nothing about the
   *  filters caused the failure. */
  onRetry?: () => void;
}

const JokeList: FC<JokeListProps> = ({ jokes, emptyCopy, onClearFilters, onRetry }) => {
  // Where the cards mounting on this render begin. "Load More" appends, so the
  // second page starts at absolute index 10 — past the stagger cap, where every
  // card would share one delay and the whole page would land in a single frame.
  // Delays are taken relative to this instead.
  //
  // React's documented "adjust state while rendering" pattern: the derived
  // batch has to be known on the very render that inserts the new cards, so it
  // cannot wait for an effect. Setting state here re-runs this component before
  // anything commits, and `nextStaggerBatch` returns the identical object for an
  // unchanged list, so the second pass is a no-op and the loop terminates.
  const [previousBatch, setPreviousBatch] = useState<StaggerBatch | null>(null);
  const batch = nextStaggerBatch(previousBatch, jokes[0]?.id ?? null, jokes.length);
  if (batch !== previousBatch) {
    setPreviousBatch(batch);
  }

  if (jokes.length === 0) {
    const copy = emptyCopy ?? {
      title: 'No jokes found.',
      hint: 'Try adding some or adjusting your filters!',
      offerClearFilters: false,
      offerRetry: false,
    };
    return (
      <EmptyState
        // An empty feed and a broken one should not wear the same face.
        icon={copy.offerRetry ? WifiOff : Laugh}
        title={copy.title}
        hint={copy.hint}
        action={
          copy.offerRetry && onRetry ? (
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RotateCcw className="mr-2 h-4 w-4" /> Try again
            </Button>
          ) : copy.offerClearFilters && onClearFilters ? (
            <Button variant="outline" size="sm" onClick={onClearFilters}>
              <RotateCcw className="mr-2 h-4 w-4" /> Clear filters
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 py-6">
      {jokes.map((joke, index) => (
        <JokeListItem key={joke.id} joke={joke} index={index - batch.start} />
      ))}
    </div>
  );
};

export default JokeList;
