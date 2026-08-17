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

  const starElements = [];
  for (let i = 0; i < maxStars; i++) {
    // Fraction of this star covered by the rating, so an average of 4.1 shows
    // four full stars plus a 10%-wide sliver rather than rounding up to five.
    const fillPercent = Math.min(Math.max(rating - i, 0), 1) * 100;
    const isFilled = i < rating;
    starElements.push(
      <Button
        key={i}
        type="button" // ensure it does not submit forms if nested
        variant="ghost"
        size="icon"
        className={cn(
          'p-0 h-auto w-auto', // remove default button padding and size constraints
          !readOnly && !disabled ? 'cursor-pointer' : 'cursor-default',
          starClassName
        )}
        onClick={() => handleStarClick(i)}
        disabled={disabled || readOnly}
        aria-label={readOnly ? `${isFilled ? 'Filled' : 'Empty'} star ${i + 1} of ${maxStars}` : `Set rating to ${i + 1} stars`}
      >
        {/* Outline underneath, partial fill clipped over the top. The wrapper is
            sized by the outline star so the percentage clip stays aligned. */}
        <span className="relative inline-flex">
          <Star size={size} fill="none" className={cn('text-muted-foreground', starClassName)} />
          {fillPercent > 0 && (
            <span
              className="absolute inset-y-0 left-0 flex overflow-hidden"
              style={{ width: `${fillPercent}%` }}
              aria-hidden="true"
            >
              <Star size={size} fill="currentColor" className={cn('text-primary', starClassName)} />
            </span>
          )}
        </span>
      </Button>
    );
  }

  return <div className={cn('flex items-center space-x-0.5', className)}>{starElements}</div>;
};

export default StarRating;
