"use client";

import { useState } from 'react';
import Link from 'next/link';
import { BookmarkPlus, Check, Loader2, Pencil, Save, ThumbsDown, ThumbsUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { StudioJoke } from '@/lib/studioBatches';
import { TASTE_LIMITS, type FeedbackVote } from '@/lib/tasteProfile';

type Props = {
  joke: StudioJoke;
  /** 1-based position in its batch; part of the thumbs' accessible names. */
  position: number;
  inSamples: boolean;
  addingSample: boolean;
  onSave: () => void;
  onEdit: () => void;
  onVote: (vote: FeedbackVote) => void;
  onReason: (reason: string) => void;
  onAddSample: () => void;
};

/** Optional "why" after a vote; submitted on Enter or when focus leaves. */
function ReasonField({ joke, onReason }: { joke: StudioJoke; onReason: (reason: string) => void }) {
  const [draft, setDraft] = useState(joke.reason ?? '');
  const id = `${joke.id}-reason`;
  const submit = () => { if (draft.trim() !== (joke.reason ?? '')) onReason(draft); };
  return (
    <div className="mt-3 space-y-1">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {joke.vote === 'up' ? 'What works? (optional)' : 'What misses? (optional)'}
      </label>
      <Input
        id={id}
        value={draft}
        maxLength={TASTE_LIMITS.reasonChars}
        placeholder={joke.vote === 'up' ? 'e.g., the twist lands on the last word' : 'e.g., too predictable'}
        onChange={event => setDraft(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); submit(); } }}
        onBlur={submit}
        className="h-8"
      />
    </div>
  );
}

export default function GeneratedJokeCard({ joke, position, inSamples, addingSample, onSave, onEdit, onVote, onReason, onAddSample }: Props) {
  const textId = `${joke.id}-text`;
  const saving = joke.status === 'saving';
  const saved = joke.status === 'saved';
  return (
    <li data-studio-joke className="rounded-lg border bg-card p-4 shadow-sm">
      <p id={textId} className="whitespace-pre-line text-base leading-relaxed text-foreground">{joke.jokeText}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{joke.category}</Badge>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Mark as a good joke, option ${position}`}
            aria-describedby={textId}
            aria-pressed={joke.vote === 'up'}
            onClick={() => onVote('up')}
          >
            <ThumbsUp className={`h-4 w-4 ${joke.vote === 'up' ? 'fill-current text-primary' : ''}`} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Mark as a bad joke, option ${position}`}
            aria-describedby={textId}
            aria-pressed={joke.vote === 'down'}
            onClick={() => onVote('down')}
          >
            <ThumbsDown className={`h-4 w-4 ${joke.vote === 'down' ? 'fill-current text-primary' : ''}`} />
          </Button>
          <Button variant="outline" size="sm" aria-describedby={textId} onClick={onAddSample} disabled={inSamples || addingSample}>
            {addingSample ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <BookmarkPlus className="mr-1 h-4 w-4" />}
            {inSamples ? 'In samples' : addingSample ? 'Adding…' : 'Add as sample'}
          </Button>
          <Button variant="outline" size="sm" aria-describedby={textId} onClick={onEdit} disabled={joke.status !== 'idle'}>
            <Pencil className="mr-1 h-4 w-4" /> Edit
          </Button>
          {saved ? (
            <span className="inline-flex items-center gap-2 text-sm font-medium">
              <span className="inline-flex items-center text-primary"><Check className="mr-1 h-4 w-4" /> Saved</span>
              {joke.savedJokeId && (
                <Link href={`/joke/${joke.savedJokeId}`} className="underline underline-offset-2 hover:text-primary">
                  View<span className="sr-only"> saved joke</span>
                </Link>
              )}
            </span>
          ) : (
            <Button size="sm" aria-describedby={textId} onClick={onSave} disabled={saving}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
              {saving ? 'Saving…' : 'Save'}
            </Button>
          )}
        </div>
      </div>
      {joke.vote && <ReasonField key={joke.vote} joke={joke} onReason={onReason} />}
    </li>
  );
}
