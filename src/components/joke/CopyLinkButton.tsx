"use client";

import { useEffect, useRef, useState } from 'react';
import { Check, Link2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { copyToClipboard, jokeShareUrl } from '@/lib/share';

interface CopyLinkButtonProps {
  jokeId: string;
}

/** How long the label stays flipped after a successful copy. */
const COPIED_LABEL_MS = 2000;

/**
 * Copies a clean link to this joke. Not owner-gated: sharing is the point of a
 * joke, and every joke in this app is publicly readable (`firestore.rules`).
 *
 * The label flips to "Copied" for two seconds *and* a toast fires. That is not
 * redundant — the label is the feedback for the person looking at the button,
 * and the toast is the one that gets announced. `aria-live` on the label itself
 * would announce it mid-word as React swaps the text.
 *
 * There is no `document.execCommand` fallback for an insecure origin. The
 * destructive toast points at the address bar, which is honest and always true,
 * and the command it would call is deprecated.
 */
export default function CopyLinkButton({ jokeId }: CopyLinkButtonProps) {
  const { toast } = useToast();
  const [justCopied, setJustCopied] = useState(false);
  // The pending label reset. Held in a ref rather than in state because nothing
  // renders from it, and because the cleanup below has to see the latest handle
  // without re-running.
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetTimerRef.current !== null) clearTimeout(resetTimerRef.current);
    },
    []
  );

  const handleCopy = async () => {
    const url = jokeShareUrl(window.location.origin, jokeId);
    const copied = await copyToClipboard(url, navigator.clipboard);

    // Cancel a reset still pending from an earlier press before deciding what
    // this one means. Without it, a second press inside the window inherits the
    // first press's deadline and the label reverts moments after a copy that
    // just succeeded; and a copy that fails after one that worked leaves the
    // label claiming otherwise.
    if (resetTimerRef.current !== null) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = null;

    if (copied) {
      setJustCopied(true);
      resetTimerRef.current = setTimeout(() => {
        resetTimerRef.current = null;
        setJustCopied(false);
      }, COPIED_LABEL_MS);
      toast({ title: 'Link copied', description: 'Paste it anywhere to share this joke.' });
      return;
    }

    setJustCopied(false);
    // The URL is in the address bar, so there is always a way out — say so
    // rather than just reporting a failure.
    toast({
      title: "Couldn't copy",
      description: 'Copy the address from your browser bar instead.',
      variant: 'destructive',
    });
  };

  // Outline, matching `BackToFeedButton` in the same row. Ghost has no border
  // and no background until hover, and there is no hover on a phone, so the
  // page's own sharing control read as plain text next to a real button. Peers,
  // not a hierarchy: one control leaves the page, the other takes it with you.
  return (
    <Button variant="outline" size="sm" onClick={handleCopy}>
      {justCopied ? (
        <Check className="mr-2 h-4 w-4" aria-hidden="true" />
      ) : (
        <Link2 className="mr-2 h-4 w-4" aria-hidden="true" />
      )}
      {justCopied ? 'Copied' : 'Copy link'}
    </Button>
  );
}
