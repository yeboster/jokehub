import type { FC } from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

interface EmptyStateProps {
  /** Lucide icon rendered in the token-tinted disc. */
  icon: LucideIcon;
  /** The headline — one sentence, stating what is not here. */
  title: string;
  /** Optional second line saying what to do about it. Plain text: it renders
   *  inside a `<p>`, so element children would be invalid markup. */
  hint?: string;
  className?: string;
  /** `sm` for empty states nested inside a card. */
  size?: 'default' | 'sm';
}

/**
 * Shared "nothing here" block: an icon in a tinted disc, a headline in
 * foreground weight, and a muted hint. Presentational only — it carries no
 * actions, because the three current call sites each sit somewhere that would
 * need different wiring, and a wrong action is worse than none.
 */
const EmptyState: FC<EmptyStateProps> = ({ icon: Icon, title, hint, className, size = 'default' }) => {
  const isSmall = size === 'sm';

  return (
    // `role="status"` because every call site swaps this block in for content
    // that was, or was about to be, there: an empty result set is a result and
    // has to be announced. The role is on the wrapper so the headline and the
    // hint are read as one message; the render is unchanged.
    <div role="status" className={cn('text-center', isSmall ? 'py-6' : 'py-12', className)}>
      <div
        className={cn(
          // The disc is a pale purple tint on a white card in light mode
          // (`--accent` 270 80% 95% on `--card` 100%, ≈1.11:1), which is not a
          // visible edge on its own. `ring-1 ring-border` draws that edge in
          // both themes and keeps the accent tint the icon is coloured for.
          // Swapping the fill to `bg-muted` would not help: 96.1% on white is
          // ≈1.09:1, flatter still.
          'mx-auto mb-4 flex items-center justify-center rounded-full bg-accent text-accent-foreground ring-1 ring-border',
          isSmall ? 'h-10 w-10' : 'h-14 w-14'
        )}
      >
        <Icon className={isSmall ? 'h-5 w-5' : 'h-7 w-7'} aria-hidden="true" />
      </div>
      <p className={cn('font-medium text-foreground', isSmall ? 'text-sm' : 'text-lg')}>{title}</p>
      {hint && <p className="mt-1.5 text-sm text-muted-foreground max-w-md mx-auto">{hint}</p>}
    </div>
  );
};

export default EmptyState;
