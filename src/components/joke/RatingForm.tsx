"use client";

import Link from 'next/link';
import { Loader2, Send } from 'lucide-react';

import type { Joke, UserRating } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import StarRating from '@/components/StarRating';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface RatingFormProps {
  joke: Joke;
  user: { uid: string } | null;
  currentUserRating: UserRating | null;
  ratingInputValue: number;
  commentInputValue: string;
  isSubmittingRating: boolean;
  isLoadingCurrentUserRating: boolean;
  onRatingInputChange: (value: number) => void;
  onCommentInputChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export default function RatingForm({
  joke,
  user,
  currentUserRating,
  ratingInputValue,
  commentInputValue,
  isSubmittingRating,
  isLoadingCurrentUserRating,
  onRatingInputChange,
  onCommentInputChange,
  onSubmit,
}: RatingFormProps) {
  return (
    <Card className="shadow-sm mb-8">
      <CardHeader>
        <CardTitle className="text-lg">
          Rate this Joke
        </CardTitle>
        {!user && <CardDescription>Please <Link href={`/auth?redirect=/joke/${joke.id}`} className="underline text-primary hover:text-primary/80">log in or sign up</Link> to rate this joke.</CardDescription>}
      </CardHeader>
      {user && (
        <CardContent>
          {isLoadingCurrentUserRating ? (
            <div className="flex items-center justify-center p-4">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="ml-2 text-muted-foreground">Loading your rating...</span>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <StarRating
                  rating={ratingInputValue}
                  onRatingChange={(newRate) => onRatingInputChange(newRate)}
                  maxStars={5}
                  size={28}
                  disabled={isSubmittingRating}
                  starClassName="text-primary" // Mockup uses yellow/orange, we use primary for consistency
                  className="mb-1"
                />
                 {ratingInputValue === 0 && <p className="text-xs text-muted-foreground">Click a star to rate.</p>}
              </div>
              <div>
                <Label htmlFor="user-rating-comment" className="block text-sm font-medium text-foreground mb-1">Add a comment (optional)</Label>
                <Textarea
                  id="user-rating-comment"
                  placeholder="What did you think of this joke?"
                  value={commentInputValue}
                  onChange={(e) => onCommentInputChange(e.target.value)}
                  disabled={isSubmittingRating}
                  maxLength={1000}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground mt-1">{commentInputValue.length}/1000 characters</p>
              </div>
              <Button type="submit" disabled={isSubmittingRating || ratingInputValue === 0}>
                {isSubmittingRating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                {isSubmittingRating ? 'Submitting...' : (currentUserRating ? 'Update Rating' : 'Submit Rating')}
              </Button>
            </form>
          )}
        </CardContent>
      )}
    </Card>
  );
}
