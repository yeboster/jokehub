"use client";

import { useId, useState } from 'react';
import { Brain, Loader2, X } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { GenerationFeedbackApi } from '@/hooks/useGenerationFeedback';
import type { GenerationFeedback } from '@/lib/tasteProfile';

function plural(count: number, word: string) { return `${count} ${word}${count === 1 ? '' : 's'}`; }

function label(item: GenerationFeedback) {
  if (item.vote === 'up') return item.saved ? 'Liked · saved' : 'Liked';
  if (item.vote === 'down') return item.saved ? 'Disliked · saved' : 'Disliked';
  return 'Saved';
}

type Props = { feedback: GenerationFeedbackApi; onRemoved: (item: GenerationFeedback) => void; onReset: () => void };

export default function TastePanel({ feedback: api, onRemoved, onReset }: Props) {
  const [open, setOpen] = useState(false);
  const baseId = useId();
  const listId = `${baseId}-list`;
  const { counts, feedback, status } = api;

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center text-lg">
          <Brain className="mr-2 h-5 w-5 text-primary" /> What the AI learns
        </CardTitle>
        <CardDescription className="text-sm">
          Learning from {plural(counts.liked, 'like')} and {plural(counts.disliked, 'dislike')}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {status === 'loading' && <p className="text-sm text-muted-foreground">Loading your feedback…</p>}
        {status === 'error' && (
          <div role="alert" className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <p>Couldn&apos;t load your feedback.</p>
            <Button variant="outline" size="sm" onClick={() => { void api.load(); }}>Retry loading feedback</Button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" aria-expanded={open} aria-controls={listId} onClick={() => setOpen(value => !value)}>
            {open ? 'Hide your feedback' : 'Your feedback'} ({feedback.length})
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={api.resetting || status !== 'ready'}>
                {api.resetting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Reset feedback
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset all feedback?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes every like, dislike, reason and saved-joke signal the AI learns from. Your saved jokes and samples stay.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep feedback</AlertDialogCancel>
                <AlertDialogAction onClick={async () => { if (await api.reset()) onReset(); }}>Reset feedback</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <div id={listId} hidden={!open}>
          {open && (feedback.length === 0 ? (
            <p className="text-sm text-muted-foreground">No feedback yet. Vote on or save generated jokes.</p>
          ) : (
            <ul className="space-y-2">
              {feedback.map(item => {
                const textId = `${baseId}-${item.id}`;
                return (
                  <li key={item.id} data-feedback className="rounded-md border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p id={textId} className="whitespace-pre-line text-sm">{item.jokeText}</p>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remove feedback"
                        aria-describedby={textId}
                        disabled={api.removing.has(item.id)}
                        onClick={async () => { if (await api.remove(item)) onRemoved(item); }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary">{label(item)}</Badge>
                      {item.reason && <span>“{item.reason}”</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
