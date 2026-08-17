"use client";

import type { FC } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface StarRatingProps {
  rating: number;
  onRatingChange?: (newRating: number) => void;
  maxStars?: number;
  size?: number;
  className?: string;
  starClassName?: string;
  disabled?: boolean;
  readOnly?: boolean;
}

interface StarGlyphProps {
  /** 0–100: how much of this star the rating covers. */
  fillPercent: number;
  size: number;
  starClassName?: string;
}

/**
 * One star: an outline with a horizontally clipped fill over the top, so an
 * average of 4.1 shows four full stars plus a 10%-wide sliver rather than
 * rounding up to five. The wrapper is sized by the outline star, which keeps
 * the percentage clip aligned.
 */
const StarGlyph: FC<StarGlyphProps> = ({ fillPercent, size, starClassName }) => (
  // Decorative in both modes: the value is announced once by the read-only
  // wrapper's label, and by each button's label in the interactive case.
  <span className="relative inline-flex" aria-hidden="true">
    <Star size={size} fill="none" className={starClassName} />
    {fillPercent > 0 && (
      <span
        className="absolute inset-y-0 left-0 flex overflow-hidden"
        style={{ width: `${fillPercent}%` }}
      >
        <Star size={size} fill="currentColor" className={cn('text-primary', starClassName)} />
      </span>
    )}
  </span>
);

const StarRating: FC<StarRatingProps> = ({
  rating,
  onRatingChange,
  maxStars = 5,
  size = 20,
  className,
  starClassName = 'text-primary',
  disabled = false,
  readOnly = false,
}) => {
  const handleStarClick = (index: number) => {
    if (!readOnly && onRatingChange && !disabled) {
      onRatingChange(index + 1);
    }
  };

  // Fraction of each star covered by the rating.
  const fillPercents = Array.from({ length: maxStars }, (_, i) =>
    Math.min(Math.max(rating - i, 0), 1) * 100
  );

  if (readOnly) {
    // A read-only rating is one value, not `maxStars` controls: five buttons
    // meant a screen reader announced "Filled star 1 of 5, Filled star 2 of
    // 5, …" on every card in the grid. One `role="img"` with the value in its
    // label says the same thing once, and matches what the fractional fill
    // actually renders.
    const displayRating = Math.round(Math.min(Math.max(rating, 0), maxStars) * 10) / 10;
    return (
      <div
        role="img"
        aria-label={`${displayRating} out of ${maxStars} stars`}
        className={cn('flex items-center space-x-0.5', className)}
      >
        {fillPercents.map((fillPercent, i) => (
          <StarGlyph key={i} fillPercent={fillPercent} size={size} starClassName={starClassName} />
        ))}
      </div>
    );
  }

  return (
    <div className={cn('flex items-center space-x-0.5', className)}>
      {fillPercents.map((fillPercent, i) => (
        <Button
          key={i}
          type="button" // ensure it does not submit forms if nested
          variant="ghost"
          size="icon"
          className={cn(
            'p-0 h-auto w-auto', // remove default button padding and size constraints
            // `buttonVariants` pins every nested svg to `size-4`, which would
            // silently ignore the `size` prop; `size-auto` hands sizing back to
            // the width/height attributes lucide renders.
            '[&_svg]:size-auto',
            disabled ? 'cursor-default' : 'cursor-pointer',
            starClassName
          )}
          onClick={() => handleStarClick(i)}
          disabled={disabled}
          aria-label={`Set rating to ${i + 1} stars`}
        >
          <StarGlyph fillPercent={fillPercent} size={size} starClassName={starClassName} />
        </Button>
      ))}
    </div>
  );
};

export default StarRating;
