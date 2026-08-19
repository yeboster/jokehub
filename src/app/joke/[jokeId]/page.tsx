"use client";

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { SearchX, ShieldAlert } from 'lucide-react';

import type { Joke, UserRating } from '@/lib/types';
import { useJokes } from '@/contexts/JokeContext';
import { useAuth } from '@/contexts/AuthContext';
import { ratingDocId } from '@/services/ratingService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import BackToFeedButton from '@/components/joke/BackToFeedButton';
import CopyLinkButton from '@/components/joke/CopyLinkButton';
import JokeHeader from '@/components/joke/JokeHeader';
import ExplanationCard from '@/components/joke/ExplanationCard';
import RatingForm from '@/components/joke/RatingForm';
import CommunityRatings from '@/components/joke/CommunityRatings';
import EmptyState from '@/components/EmptyState';
import PageLoading from '@/components/PageLoading';

export default function JokeShowPage() {
  const params = useParams();
  const { getJokeById, submitUserRating, fetchAllRatingsForJoke, toggleUsed } = useJokes();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [joke, setJoke] = useState<Joke | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // User Rating State
  const [currentUserRating, setCurrentUserRating] = useState<UserRating | null>(null);
  const [ratingInputValue, setRatingInputValue] = useState<number>(0);
  const [commentInputValue, setCommentInputValue] = useState<string>('');
  const [isSubmittingRating, setIsSubmittingRating] = useState<boolean>(false);
  const [isLoadingCurrentUserRating, setIsLoadingCurrentUserRating] = useState<boolean>(true);

  // All Users' Ratings State (for average and community list)
  const [allUserRatings, setAllUserRatings] = useState<UserRating[]>([]);
  const [isLoadingAllRatings, setIsLoadingAllRatings] = useState<boolean>(true);

  // Explanation state
  const [explanation, setExplanation] = useState<string>('');
  const [isExplanationLoading, setIsExplanationLoading] = useState<boolean>(false);


  const jokeId = Array.isArray(params.jokeId) ? params.jokeId[0] : params.jokeId;
  const isOwner = user && joke && joke.userId === user.uid;

  const handleToggleUsed = async () => {
    if (!joke || !isOwner) return;
    try {
      // The context function handles the API call and shows a toast on success/error.
      await toggleUsed(joke.id, joke.used);
      // Update local state for immediate UI feedback.
      setJoke((prevJoke) => (prevJoke ? { ...prevJoke, used: !prevJoke.used } : null));
    } catch (error) {
      // Context will show an error toast, but we can log here if needed.
      console.error("Failed to toggle 'used' status from page:", error);
    }
  };

  /**
   * Streams an explanation for the current joke. Only ever invoked from an
   * explicit user click — the API spends a Gemini call per request, so nothing
   * here runs on page view. The route reads the joke text from Firestore
   * itself; the client sends only the id plus the user's ID token.
   */
  const streamExplanation = useCallback(async (targetJokeId: string) => {
    if (!user) {
      toast({ title: 'Sign in required', description: 'Log in to get an AI explanation.', variant: 'destructive' });
      return;
    }

    setIsExplanationLoading(true);
    let receivedAnyChunk = false;

    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/explain-joke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ jokeId: targetJokeId }),
      });

      if (!response.ok || !response.body) {
        let message = `Failed to get explanation: ${response.statusText}`;
        try {
          const errorData = await response.json();
          if (errorData?.error) message = errorData.error;
        } catch { /* non-JSON error body — keep the status text */ }
        throw new Error(message);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      const appendChunk = (chunk: string) => {
        if (!chunk) return;
        // Replace any previously displayed explanation only once the new one
        // starts arriving, so a failed request leaves the old text intact.
        if (receivedAnyChunk) {
          setExplanation(prev => prev + chunk);
        } else {
          receivedAnyChunk = true;
          setIsExplanationLoading(false);
          setExplanation(chunk);
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        appendChunk(decoder.decode(value, { stream: true }));
      }
      appendChunk(decoder.decode());

      // A 200 with an empty body: the previous explanation (if any) is left
      // untouched, so without this the click would look like it did nothing.
      if (!receivedAnyChunk) {
        toast({
          title: "Couldn't explain that one",
          description: 'No explanation came back — try again.',
          variant: 'destructive',
        });
      }

    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- streaming fetch + AI errors expose heterogeneous shapes; unknown narrows too aggressively for the toast description string.
      const err = error as any;
      console.error("Error streaming explanation:", err);
      toast({
        title: "Couldn't explain that one",
        description: err?.message || "Sorry, I couldn't come up with an explanation right now.",
        variant: 'destructive',
      });
    } finally {
      setIsExplanationLoading(false);
    }
  }, [user, toast]);


  useEffect(() => {
    async function fetchJokeAndAllRatings() {
      if (!jokeId) {
        setError("Joke ID is missing.");
        setIsLoading(false);
        setIsLoadingCurrentUserRating(false);
        setIsLoadingAllRatings(false);
        return;
      }
      setIsLoading(true);
      setIsLoadingCurrentUserRating(true);
      setIsLoadingAllRatings(true);
      setError(null);

      try {
        const fetchedJoke = await getJokeById(jokeId);
        if (fetchedJoke) {
          setJoke(fetchedJoke);
          // Persisted explanations display automatically; generating a missing
          // one requires an explicit click (see ExplanationCard).
          setExplanation(fetchedJoke.explanation ?? '');
          setIsExplanationLoading(false);

          // Fetch all ratings for this joke
          const allRatings = await fetchAllRatingsForJoke(jokeId);
          setAllUserRatings(allRatings);
          setIsLoadingAllRatings(false);

          // Determine current user's rating from the allRatings list
          if (user) {
            const userRating = allRatings.find(rating => rating.userId === user.uid);
            if (userRating) {
              setCurrentUserRating(userRating);
              setRatingInputValue(userRating.stars);
              setCommentInputValue(userRating.comment || '');
            } else {
              setCurrentUserRating(null);
              setRatingInputValue(0);
              setCommentInputValue('');
            }
          } else {
            setCurrentUserRating(null);
            setRatingInputValue(0);
            setCommentInputValue('');
          }
          setIsLoadingCurrentUserRating(false);

        } else {
          setError("Joke not found. It might have been deleted or the ID is incorrect.");
          setIsLoadingCurrentUserRating(false);
          setIsLoadingAllRatings(false);
        }
      } catch (err) {
        console.error("Error fetching joke or ratings:", err);
        setError("Failed to load the joke or ratings. Please try again later.");
        setIsLoadingCurrentUserRating(false);
        setIsLoadingAllRatings(false);
      } finally {
        setIsLoading(false);
      }
    }

    if (!authLoading && jokeId) {
      fetchJokeAndAllRatings();
    } else if (!jokeId && !authLoading) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- setError/loading flags when the URL is missing a jokeId, so we surface a real error state instead of an infinite loading spinner.
      setError("Joke ID is missing.");
      setIsLoading(false);
      setIsLoadingCurrentUserRating(false);
      setIsLoadingAllRatings(false);
    }
  }, [jokeId, user, getJokeById, fetchAllRatingsForJoke, authLoading]);


  const handleRatingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !joke) {
      toast({ title: "Couldn't submit", description: 'Log in and wait for the joke to load.', variant: 'destructive' });
      return;
    }
    setIsSubmittingRating(true);
    try {
      const aggregates = await submitUserRating(joke.id, ratingInputValue, commentInputValue);
      // The only toast for this action: `submitUserRating` passes `null` to
      // `handleApiCall` precisely because the context cannot tell a new rating
      // from an updated one and this page can.
      toast({
        title: currentUserRating ? 'Rating updated' : 'Rating saved',
        description: currentUserRating ? 'Your new rating is in.' : 'Thanks for rating.',
      });

      // Single round trip: the transaction returns the joke's new totals and we
      // already know what we just submitted, so both the joke and the ratings
      // list are patched locally instead of re-read.
      if (aggregates) {
        setJoke(prevJoke => (prevJoke ? { ...prevJoke, ...aggregates } : prevJoke));
      }

      const trimmedComment = commentInputValue.trim();
      const now = new Date();
      const submittedRating: UserRating = {
        id: currentUserRating?.id ?? ratingDocId(joke.id, user.uid),
        jokeId: joke.id,
        userId: user.uid,
        stars: ratingInputValue,
        // `null`, not `undefined` — the same shape the rating transaction
        // writes for a blank comment, so the local patch and a later refetch
        // agree.
        comment: trimmedComment === '' ? null : trimmedComment,
        createdAt: currentUserRating?.createdAt ?? now,
        updatedAt: now,
      };
      setCurrentUserRating(submittedRating);
      setCommentInputValue(submittedRating.comment ?? '');
      // The list is ordered by `updatedAt` desc, so the just-saved rating goes first.
      setAllUserRatings(prevRatings => [
        submittedRating,
        ...prevRatings.filter(rating => rating.userId !== user.uid),
      ]);

    } catch (err) {
      console.error("Error submitting rating from page:", err);
    } finally {
      setIsSubmittingRating(false);
    }
  };

  const otherUserRatingsToDisplay = useMemo(() => {
    if (isLoadingAllRatings || !allUserRatings) return [];
    return allUserRatings.filter(rating => rating.userId !== user?.uid);
  }, [allUserRatings, user, isLoadingAllRatings]);

  const averageRating = useMemo(
    () => ({ average: joke?.averageRating ?? 0, count: joke?.ratingCount ?? 0 }),
    [joke?.averageRating, joke?.ratingCount]
  );

  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- try/catch inside useMemo defeats compiler memoization inference; deps are correct.
  const isSourceUrl = useMemo(() => {
    if (!joke?.source) return false;
    try {
      const url = new URL(joke.source);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }, [joke?.source]);


  if (isLoading || authLoading) {
    return <PageLoading label="Loading this joke…" />;
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8 sm:px-6 md:py-12 max-w-3xl">
        <div className="mb-6">
          <BackToFeedButton />
        </div>
        <Card>
          <CardHeader>
            <CardTitle as="h1" className="text-error">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4 p-3 rounded-md bg-error/10 border border-error/30 text-error flex items-center">
              <ShieldAlert className="mr-2 h-5 w-5 flex-shrink-0" />
              <p>{error}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!joke) {
     return (
      <div className="container mx-auto px-4 py-8 sm:px-6 md:py-12 max-w-3xl">
        <div className="mb-6">
          <BackToFeedButton />
        </div>
        {/* The fourth empty state. It was a Card with the headline "Hmm..." —
            an interjection, not a statement of what is not here. */}
        <EmptyState
          icon={SearchX}
          // The page's only heading, because this branch renders no Header.
          titleAs="h1"
          title="We couldn't find that joke."
          hint="It may have been deleted, or the link may be wrong."
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 sm:px-6 md:py-12 max-w-3xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <BackToFeedButton />
        <CopyLinkButton jokeId={joke.id} />
      </div>

      {/* Joke Display Area */}
      <JokeHeader
        joke={joke}
        isOwner={!!isOwner}
        isSourceUrl={isSourceUrl}
        onToggleUsed={handleToggleUsed}
      />

      {/* Joke Explanation Section */}
      <ExplanationCard
        explanation={explanation}
        isExplanationLoading={isExplanationLoading}
        canExplain={!!user}
        onExplain={() => streamExplanation(joke.id)}
      />

      {/* User Rating Section */}
      <RatingForm
        joke={joke}
        user={user}
        currentUserRating={currentUserRating}
        ratingInputValue={ratingInputValue}
        commentInputValue={commentInputValue}
        isSubmittingRating={isSubmittingRating}
        isLoadingCurrentUserRating={isLoadingCurrentUserRating}
        onRatingInputChange={setRatingInputValue}
        onCommentInputChange={setCommentInputValue}
        onSubmit={handleRatingSubmit}
      />

      {/* Ratings & Comments Section */}
      <CommunityRatings
        allUserRatings={allUserRatings}
        isLoadingAllRatings={isLoadingAllRatings}
        averageRating={averageRating}
        otherUserRatingsToDisplay={otherUserRatingsToDisplay}
      />

    </div>
  );
}
