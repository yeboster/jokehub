import type { FC, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

interface EmptyStateProps {
  /** Lucide icon rendered in the token-tinted disc. */
  icon: LucideIcon;
  /** The headline — one sentence, stating what is not here. */
  title: string;
  /** Optional second line saying what to do about it. */
  hint?: ReactNode;
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
    <div className={cn('text-center', isSmall ? 'py-6' : 'py-12', className)}>
      <div
        className={cn(
          'mx-auto mb-4 flex items-center justify-center rounded-full bg-accent text-accent-foreground',
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
