"use client";

import { useState, type FC } from 'react';
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
  // The value under the cursor or keyboard focus, or `null` for "no preview,
  // show the committed rating". Held unconditionally — hooks cannot sit below
  // the read-only early return — and simply never set in read-only mode.
  const [hoverRating, setHoverRating] = useState<number | null>(null);

  const isInteractive = !readOnly && !disabled;

  const handleStarClick = (index: number) => {
    if (!readOnly && onRatingChange && !disabled) {
      onRatingChange(index + 1);
    }
  };

  const previewStar = (starValue: number | null) => {
    if (!isInteractive) return;
    setHoverRating(starValue);
  };

  // Interactive stars render the previewed value so you can see four stars
  // before committing to four stars. Falls back to the committed rating the
  // moment the pointer or focus leaves.
  const displayedValue = isInteractive ? hoverRating ?? rating : rating;

  // Fraction of each star covered by the displayed value.
  const fillPercents = Array.from({ length: maxStars }, (_, i) =>
    Math.min(Math.max(displayedValue - i, 0), 1) * 100
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
    <div
      className={cn('flex items-center space-x-0.5', className)}
      onMouseLeave={() => previewStar(null)}
    >
      {fillPercents.map((fillPercent, i) => (
        <Button
          key={i}
          type="button" // ensure it does not submit forms if nested
          variant="ghost"
          size="icon"
          className={cn(
            'p-1 h-auto w-auto', // remove default button padding and size constraints
            // `buttonVariants` pins every nested svg to `size-4`, which would
            // silently ignore the `size` prop; `size-auto` hands sizing back to
            // the width/height attributes lucide renders.
            '[&_svg]:size-auto',
            // The base button already transitions `transform` and dips on
            // press; stars additionally grow a little under the cursor so the
            // one you are aiming at is unambiguous.
            isInteractive && 'motion-safe:hover:scale-110 motion-safe:focus-visible:scale-110',
            disabled ? 'cursor-default' : 'cursor-pointer',
            starClassName
          )}
          onClick={() => handleStarClick(i)}
          onMouseEnter={() => previewStar(i + 1)}
          onFocus={() => previewStar(i + 1)}
          onBlur={() => previewStar(null)}
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
