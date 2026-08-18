"use client";

import { Loader2, Lightbulb } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ExplanationCardProps {
  explanation: string;
  isExplanationLoading: boolean;
  /** Whether the viewer is signed in — explanations require an authenticated request. */
  canExplain: boolean;
  onExplain: () => void;
}

export default function ExplanationCard({
  explanation,
  isExplanationLoading,
  canExplain,
  onExplain,
}: ExplanationCardProps) {
  const hasExplanation = explanation.trim().length > 0;

  return (
    <Card className="shadow-sm mb-8 bg-accent/50 border-primary/20">
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <CardTitle className="text-lg flex items-center gap-2 text-accent-foreground">
            <Lightbulb className="h-5 w-5" /> The Comedian&apos;s Take
          </CardTitle>
          <Button
            variant={hasExplanation ? 'outline' : 'default'}
            size="sm"
            onClick={onExplain}
            disabled={isExplanationLoading || !canExplain}
          >
            {isExplanationLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isExplanationLoading
              ? 'Explaining...'
              : hasExplanation
                ? 'Explain again'
                : 'Explain this joke'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isExplanationLoading && !hasExplanation ? (
          <div className="flex items-center text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            <span>Thinking...</span>
          </div>
        ) : hasExplanation ? (
          <p className="text-foreground/90 whitespace-pre-wrap leading-relaxed">{explanation}</p>
        ) : (
          <p className="text-muted-foreground">
            {canExplain
              ? 'No explanation yet. Ask the comedian to break this one down.'
              : 'Log in to have the comedian break this one down.'}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
