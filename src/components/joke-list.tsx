
"use client";

import type { FC } from 'react';
import type { Joke } from '@/lib/types';
// Removed Table related imports
import JokeListItem from './joke-list-item';
import { Laugh } from 'lucide-react';

interface JokeListProps {
  jokes: Joke[];
  /** Overrides the empty-state headline, e.g. to name what was searched for. */
  emptyMessage?: string;
  /** Overrides the empty-state hint below the headline. */
  emptyHint?: string;
}

const JokeList: FC<JokeListProps> = ({ jokes, emptyMessage, emptyHint }) => {
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
      {jokes.map((joke) => (
        <JokeListItem key={joke.id} joke={joke} />
      ))}
    </div>
  );
};

export default JokeList;
