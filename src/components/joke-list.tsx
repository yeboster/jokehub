
"use client";

import { useState, type FC } from 'react';
import type { Joke } from '@/lib/types';
// Removed Table related imports
import JokeListItem from './joke-list-item';
import { nextStaggerBatch, type StaggerBatch } from '@/lib/motion';
import { Laugh } from 'lucide-react';

interface JokeListProps {
  jokes: Joke[];
  /** Overrides the empty-state headline, e.g. to name what was searched for. */
  emptyMessage?: string;
  /** Overrides the empty-state hint below the headline. */
  emptyHint?: string;
}

const JokeList: FC<JokeListProps> = ({ jokes, emptyMessage, emptyHint }) => {
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
    return (
      <div className="text-center py-10">
        <Laugh className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
        <p className="text-muted-foreground text-lg">{emptyMessage ?? 'No jokes found.'}</p>
        <p className="text-sm text-muted-foreground">
          {emptyHint ?? 'Try adding some or adjusting your filters!'}
        </p>
      </div>
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
