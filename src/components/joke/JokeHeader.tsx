"use client";

import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { CalendarDays, Edit3, BookOpen, ExternalLink, UserCircle } from 'lucide-react';

import type { Joke } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface JokeHeaderProps {
  joke: Joke;
  isOwner: boolean;
  isSourceUrl: boolean;
  onToggleUsed: () => void;
}

export default function JokeHeader({ joke, isOwner, isSourceUrl, onToggleUsed }: JokeHeaderProps) {
  const router = useRouter();

  return (
    <section className="mb-8">
      {/* This h1 is the joke itself, which can run to several sentences —
          smaller than a page title on purpose, with tighter leading. */}
      <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-4 leading-snug">
        {joke.text}
      </h1>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm text-muted-foreground mb-6">
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="bg-accent text-accent-foreground">{joke.category}</Badge>
          {joke.source && (
              <span className="flex items-center">
                  <BookOpen className="mr-1.5 h-4 w-4 text-primary" />
                  {isSourceUrl ? (
                       <a href={joke.source} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-primary underline hover:text-primary/80">
                         <span>View Source</span>
                         <ExternalLink className="h-3.5 w-3.5" />
                       </a>
                  ) : (
                       <span>Source: {joke.source}</span>
                  )}
              </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center"><CalendarDays className="mr-1.5 h-4 w-4 text-primary" /> {format(joke.dateAdded, 'MMM d, yyyy')}</span>
          <span className="flex items-center">
            <UserCircle className="mr-1.5 h-4 w-4 text-primary" /> Joke by: {isOwner ? 'You' : 'A user'}
          </span>
          {isOwner && (
            <div className="flex items-center gap-4 border-l border-border/50 pl-4 ml-2">
              <div className="flex items-center space-x-2">
                <Switch
                  id="used-status-toggle"
                  checked={!!joke.used}
                  onCheckedChange={onToggleUsed}
                  aria-label={`Mark joke as ${joke.used ? 'unused' : 'used'}`}
                />
                <Label htmlFor="used-status-toggle" className="text-xs font-normal text-muted-foreground cursor-pointer select-none">
                  {joke.used ? "Used" : "Unused"}
                </Label>
              </div>
              <Button variant="ghost" size="sm" onClick={() => router.push(`/edit-joke/${joke.id}`)} className="text-primary hover:text-primary/80 px-2 h-auto py-1">
                  <Edit3 className="mr-1.5 h-3.5 w-3.5" /> Edit
              </Button>
            </div>
          )}
        </div>
      </div>
      <Separator />
    </section>
  );
}
