import type { FC } from 'react';
import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

interface PageLoadingProps {
  /**
   * What is loading, as a sentence fragment ending in an ellipsis character:
   * "Loading jokes…", "Checking your sign-in…". Always name the thing — a bare
   * "Loading…" tells the user nothing they can't see from the spinner.
   */
  label: string;
  /** Drop the page container and the viewport centring, for a loader that sits
   *  inside a section that already has both. */
  inline?: boolean;
  className?: string;
}

/**
 * The app's one loading block. Every page had its own: four used `flex-col`
 * with `mt-2`, four a row with `ml-2`, and the labels ran to nine phrasings of
 * the same idea.
 *
 * `animate-spin` deliberately keeps turning under `prefers-reduced-motion` —
 * see the policy block at the end of `globals.css`. A frozen spinner reads as
 * a hung request.
 */
const PageLoading: FC<PageLoadingProps> = ({ label, inline = false, className }) => (
  // `role="status"` with the label as its only content: the announcement is
  // the label, and it fires when this mounts and again when it unmounts to
  // whatever replaced it.
  <div
    role="status"
    className={cn(
      'flex items-center justify-center gap-2',
      inline
        ? 'min-h-[150px]'
        : 'container mx-auto px-4 py-8 sm:px-6 md:py-12 min-h-[calc(100vh-8rem)]',
      className
    )}
  >
    <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
    <p className="text-muted-foreground">{label}</p>
  </div>
);

export default PageLoading;
