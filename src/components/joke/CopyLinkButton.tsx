"use client";

import { useState } from 'react';
import { Check, Link2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { copyToClipboard, jokeShareUrl } from '@/lib/share';

interface CopyLinkButtonProps {
  jokeId: string;
}

/**
 * Copies a clean link to this joke. Not owner-gated: sharing is the point of a
 * joke, and every joke in this app is publicly readable (`firestore.rules`).
 *
 * The label flips to "Copied" for two seconds *and* a toast fires. That is not
 * redundant — the label is the feedback for the person looking at the button,
 * and the toast is the one that gets announced. `aria-live` on the label itself
 * would announce it mid-word as React swaps the text.
 */
export default function CopyLinkButton({ jokeId }: CopyLinkButtonProps) {
  const { toast } = useToast();
  const [justCopied, setJustCopied] = useState(false);

  const handleCopy = async () => {
    const url = jokeShareUrl(window.location.origin, jokeId);
    const copied = await copyToClipboard(url, navigator.clipboard);
    if (copied) {
      setJustCopied(true);
      setTimeout(() => setJustCopied(false), 2000);
      toast({ title: 'Link copied', description: 'Paste it anywhere to share this joke.' });
      return;
    }
    // The URL is in the address bar, so there is always a way out — say so
    // rather than just reporting a failure.
    toast({
      title: "Couldn't copy",
      description: 'Copy the address from your browser bar instead.',
      variant: 'destructive',
    });
  };

  return (
    <Button variant="ghost" size="sm" onClick={handleCopy}>
      {justCopied ? (
        <Check className="mr-2 h-4 w-4" aria-hidden="true" />
      ) : (
        <Link2 className="mr-2 h-4 w-4" aria-hidden="true" />
      )}
      {justCopied ? 'Copied' : 'Copy link'}
    </Button>
  );
}
