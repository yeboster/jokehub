"use client";

import { ChevronDown } from 'lucide-react';
import { GEMINI_MODEL_LABELS, isGeminiModel } from '@/ai/models';
import type { StudioBatch, StudioJoke } from '@/lib/studioBatches';
import type { FeedbackVote } from '@/lib/tasteProfile';
import GeneratedJokeCard from './GeneratedJokeCard';

export function modelLabel(model: string) {
  return isGeminiModel(model) ? GEMINI_MODEL_LABELS[model] : model;
}

export type CardHandlers = {
  onSave: (joke: StudioJoke) => void;
  onEdit: (batch: StudioBatch, joke: StudioJoke) => void;
  onVote: (joke: StudioJoke, vote: FeedbackVote) => void;
  onReason: (joke: StudioJoke, reason: string) => void;
  onAddSample: (joke: StudioJoke) => void;
  inSamples: (text: string) => boolean;
  addingSample: (text: string) => boolean;
};

type Props = CardHandlers & { batch: StudioBatch; expanded: boolean; onToggle: () => void };

export default function GeneratedBatch({ batch, expanded, onToggle, ...handlers }: Props) {
  const listId = `${batch.id}-jokes`;
  const time = new Date(batch.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const partial = batch.jokes.length < batch.requestedCount;
  return (
    <section className="rounded-lg border bg-muted/20" aria-label={`Batch from ${time}`}>
      <h4 className="m-0">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={onToggle}
          className="flex w-full items-start justify-between gap-3 rounded-lg p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="space-y-0.5">
            <span className="block text-sm font-semibold">
              {time} · {batch.jokes.length} joke{batch.jokes.length === 1 ? '' : 's'}
              {batch.topicHint ? ` · ${batch.topicHint}` : ''}
            </span>
            <span className="block text-xs text-muted-foreground">
              {batch.mode === 'classic' ? 'Proven classics' : 'New jokes'} · by {modelLabel(batch.model)}
            </span>
          </span>
          <ChevronDown aria-hidden className={`mt-0.5 h-4 w-4 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </h4>
      <div id={listId} className="px-3 pb-3" hidden={!expanded}>
        {expanded && (
          <>
            {partial && (
              <p className="mb-2 text-sm text-muted-foreground">
                Only {batch.jokes.length} of {batch.requestedCount} passed the quality check.
              </p>
            )}
            <ul className="space-y-3">
              {batch.jokes.map((joke, index) => (
                <GeneratedJokeCard
                  key={joke.id}
                  joke={joke}
                  position={index + 1}
                  inSamples={handlers.inSamples(joke.jokeText)}
                  addingSample={handlers.addingSample(joke.jokeText)}
                  onSave={() => handlers.onSave(joke)}
                  onEdit={() => handlers.onEdit(batch, joke)}
                  onVote={vote => handlers.onVote(joke, vote)}
                  onReason={reason => handlers.onReason(joke, reason)}
                  onAddSample={() => handlers.onAddSample(joke)}
                />
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
