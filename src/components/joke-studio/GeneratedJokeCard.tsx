"use client";

import { useEffect, useRef, useState } from 'react';
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
  /** Edit is locked while the form saves, so the form's link cannot move. */
  editLocked: boolean;
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

export default function GeneratedJokeCard({ joke, position, inSamples, addingSample, editLocked, onSave, onEdit, onVote, onReason, onAddSample }: Props) {
  const textId = `${joke.id}-text`;
  const saving = joke.status === 'saving';
  const saved = joke.status === 'saved';

  // The button the user pressed disappears (Save) or disables (Add as
  // sample) on success; move focus to what replaced it instead of <body>.
  const savedLink = useRef<HTMLSpanElement>(null);
  const saveButton = useRef<HTMLButtonElement>(null);
  const sampleStatus = useRef<HTMLSpanElement>(null);
  const sampleButton = useRef<HTMLButtonElement>(null);
  // Set by the click, consumed when the outcome renders. A save that fails
  // within one render never disables the button, so focus is still on it.
  const focusAfterSave = useRef(false);
  const focusAfterSample = useRef(false);
  useEffect(() => {
    if (!focusAfterSave.current || joke.status === 'saving') return;
    focusAfterSave.current = false;
    if (joke.status === 'saved') savedLink.current?.querySelector('a')?.focus();
    else saveButton.current?.focus();
  }, [joke.status]);
  useEffect(() => {
    if (!focusAfterSample.current || addingSample) return;
    focusAfterSample.current = false;
    if (inSamples) sampleStatus.current?.focus();
    else sampleButton.current?.focus();
  }, [addingSample, inSamples]);
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
          {inSamples ? (
            <span ref={sampleStatus} tabIndex={-1} aria-describedby={textId} className="inline-flex h-9 items-center px-2 text-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md">
              <Check className="mr-1 h-4 w-4" /> In samples
            </span>
          ) : (
            <Button ref={sampleButton} variant="outline" size="sm" aria-describedby={textId} onClick={() => { focusAfterSample.current = true; onAddSample(); }} disabled={addingSample}>
              {addingSample ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <BookmarkPlus className="mr-1 h-4 w-4" />}
              {addingSample ? 'Adding…' : 'Add as sample'}
            </Button>
          )}
          <Button variant="outline" size="sm" aria-describedby={textId} onClick={onEdit} disabled={joke.status !== 'idle' || editLocked}>
            <Pencil className="mr-1 h-4 w-4" /> Edit
          </Button>
          {saved ? (
            <span ref={savedLink} className="inline-flex items-center gap-2 text-sm font-medium">
              <span className="inline-flex items-center text-primary"><Check className="mr-1 h-4 w-4" /> Saved</span>
              {joke.savedJokeId && (
                <Link href={`/joke/${joke.savedJokeId}`} className="underline underline-offset-2 hover:text-primary">
                  View<span className="sr-only"> saved joke</span>
                </Link>
              )}
            </span>
          ) : (
            <Button ref={saveButton} size="sm" aria-describedby={textId} onClick={() => { focusAfterSave.current = true; onSave(); }} disabled={saving}>
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
