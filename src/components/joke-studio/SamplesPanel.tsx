"use client";

import { useId, useState, type FormEvent } from 'react';
import { BookmarkPlus, Loader2, Star, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { JokeSamplesApi } from '@/hooks/useJokeSamples';
import { JOKE_GENERATION_LIMITS, normalizeJokeKey } from '@/lib/jokeGenerationContract';
import { TASTE_LIMITS } from '@/lib/tasteProfile';

export default function SamplesPanel({ samples: api }: { samples: JokeSamplesApi }) {
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const baseId = useId();
  const { samples, status } = api;
  const full = samples.length >= TASTE_LIMITS.maxSamples;
  const adding = api.isAdding(text);
  const canAdd = !!normalizeJokeKey(text) && !adding && !full && status === 'ready';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canAdd) return;
    const outcome = await api.add(text, note);
    if (outcome === 'created' || outcome === 'existing') { setText(''); setNote(''); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center text-lg">
          <BookmarkPlus className="mr-2 h-5 w-5 text-primary" /> Samples
        </CardTitle>
        <CardDescription className="text-sm">
          Jokes that show the AI your taste. Active samples steer every batch when “Use my samples &amp; feedback” is on.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{samples.length} of {TASTE_LIMITS.maxSamples} samples</p>

        <form onSubmit={submit} className="space-y-2">
          <Label htmlFor={`${baseId}-text`}>New sample</Label>
          <Textarea
            id={`${baseId}-text`}
            value={text}
            onChange={event => setText(event.target.value)}
            maxLength={JOKE_GENERATION_LIMITS.contextTextChars}
            rows={2}
            placeholder="Paste or type a joke you love…"
            disabled={full}
          />
          <Label htmlFor={`${baseId}-note`}>Note (optional)</Label>
          <Input
            id={`${baseId}-note`}
            value={note}
            onChange={event => setNote(event.target.value)}
            maxLength={TASTE_LIMITS.noteChars}
            placeholder="e.g., love the misdirection"
            disabled={full}
          />
          {full && <p className="text-sm text-muted-foreground">You have reached the {TASTE_LIMITS.maxSamples}-sample limit. Delete one to add another.</p>}
          <Button type="submit" size="sm" className="w-full" disabled={!canAdd}>
            {adding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BookmarkPlus className="mr-2 h-4 w-4" />}
            {adding ? 'Adding…' : 'Add sample'}
          </Button>
        </form>

        <Button variant="outline" size="sm" className="w-full" onClick={() => { void api.importFiveStar(); }} disabled={api.importing || full || status !== 'ready'}>
          {api.importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Star className="mr-2 h-4 w-4 text-primary" />}
          {api.importing ? 'Importing…' : 'Import my 5-star jokes'}
        </Button>

        {status === 'loading' && <p className="text-sm text-muted-foreground">Loading samples…</p>}
        {status === 'error' && (
          <div role="alert" className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <p>Couldn&apos;t load your samples.</p>
            <Button variant="outline" size="sm" onClick={() => { void api.load(); }}>Retry loading samples</Button>
          </div>
        )}
        {status === 'ready' && samples.length === 0 && (
          <p className="text-sm text-muted-foreground">No samples yet. Add one above or from a generated joke.</p>
        )}
        {samples.length > 0 && (
          <ul className="space-y-2">
            {samples.map(sample => {
              const textId = `${baseId}-${sample.id}`;
              const busy = api.pending.has(sample.id);
              return (
                <li key={sample.id} data-sample className="rounded-md border p-3">
                  <p id={textId} className="whitespace-pre-line text-sm">{sample.text}</p>
                  {sample.note && <p className="mt-1 text-xs text-muted-foreground">Note: {sample.note}</p>}
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Switch
                        id={`${textId}-active`}
                        checked={sample.active}
                        onCheckedChange={active => { void api.setActive(sample, active); }}
                        disabled={busy}
                        aria-describedby={textId}
                      />
                      <Label htmlFor={`${textId}-active`} className="text-xs font-normal">Use this sample</Label>
                    </div>
                    <Button variant="ghost" size="sm" aria-describedby={textId} onClick={() => { void api.remove(sample); }} disabled={busy}>
                      <Trash2 className="mr-1 h-4 w-4" /> Delete
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
