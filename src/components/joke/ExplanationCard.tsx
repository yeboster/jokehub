"use client";

import { Loader2, Lightbulb } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ExplanationCardProps {
  explanation: string;
  isExplanationLoading: boolean;
  onExplainAgain: () => void;
}

export default function ExplanationCard({ explanation, isExplanationLoading, onExplainAgain }: ExplanationCardProps) {
  return (
    <Card className="shadow-lg mb-8 bg-accent/50 border-primary/20">
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <CardTitle className="text-xl flex items-center gap-2 text-accent-foreground">
            <Lightbulb className="h-5 w-5" /> The Comedian&apos;s Take
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={onExplainAgain}
            disabled={isExplanationLoading}
          >
            {isExplanationLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isExplanationLoading ? 'Explaining...' : 'Explain again'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isExplanationLoading ? (
          <div className="flex items-center text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            <span>Thinking...</span>
          </div>
        ) : (
          <p className="text-foreground/90 whitespace-pre-wrap leading-relaxed">{explanation}</p>
        )}
      </CardContent>
    </Card>
  );
}
