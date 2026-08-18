"use client";

import { format } from 'date-fns';
import { Loader2, MessageSquareOff } from 'lucide-react';

import type { UserRating } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import StarRating from '@/components/StarRating';
import EmptyState from '@/components/EmptyState';
import { Separator } from '@/components/ui/separator';

interface CommunityRatingsProps {
  allUserRatings: UserRating[];
  isLoadingAllRatings: boolean;
  averageRating: { average: number; count: number };
  otherUserRatingsToDisplay: UserRating[];
}

export default function CommunityRatings({
  allUserRatings,
  isLoadingAllRatings,
  averageRating,
  otherUserRatingsToDisplay,
}: CommunityRatingsProps) {
  return (
    <Card className="shadow-sm">
        <CardHeader>
            <CardTitle className="text-lg">
                Ratings & Comments
            </CardTitle>
        </CardHeader>
        <CardContent>
            {isLoadingAllRatings ? (
                <div className="flex items-center justify-center p-4">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <span className="ml-2 text-muted-foreground">Loading community ratings...</span>
                </div>
            ) : (
              <>
                {allUserRatings.length > 0 && (
                  <div className="mb-6 p-4 bg-muted/50 rounded-md flex items-center gap-3">
                    <span className="font-semibold text-foreground">Average Rating:</span>
                    <StarRating rating={averageRating.average} readOnly size={22} starClassName="text-primary" />
                    <span className="font-bold text-foreground">{averageRating.average.toFixed(1)}</span>
                    <span className="text-sm text-muted-foreground">(based on {averageRating.count} rating{averageRating.count === 1 ? '' : 's'})</span>
                  </div>
                )}

                {otherUserRatingsToDisplay.length === 0 ? (
                    <EmptyState
                      size="sm"
                      icon={MessageSquareOff}
                      title={allUserRatings.length > 0 ? 'No other community feedback yet.' : 'No community feedback yet.'}
                      hint={allUserRatings.length > 0 ? undefined : 'Be the first to rate this one.'}
                    />
                ) : (
                    <div className="space-y-6">
                        {otherUserRatingsToDisplay.map((rating, index) => (
                            <div key={rating.id}>
                                <div className="flex items-center gap-2 mb-1">
                                  <StarRating rating={rating.stars} readOnly size={20} starClassName="text-primary" />
                                  <span className="text-sm font-medium text-foreground">
                                    User {/* Replace with user identifier if available, e.g., rating.userDisplayName || 'A User' */}
                                  </span>
                                  <span className="text-xs text-muted-foreground">- {format(rating.updatedAt, 'MMM d, yyyy')}</span>
                                </div>
                                {rating.comment && (
                                    <p className="text-sm text-foreground bg-muted/30 p-3 rounded-md whitespace-pre-wrap">{rating.comment}</p>
                                )}
                                {index < otherUserRatingsToDisplay.length - 1 && <Separator className="my-4" />}
                            </div>
                        ))}
                    </div>
                )}
              </>
            )}
        </CardContent>
    </Card>
  );
}
