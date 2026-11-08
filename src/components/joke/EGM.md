# Joke Detail Components (`src/components/joke`)

## Overview

These are the client components for the single-joke detail page: a back-to-feed link, the community ratings list, a copy-link button, the AI explanation card, the joke header, and the rating form. No file here imports a service module. Every data write goes through a callback prop that the parent page supplies.

## Interface

Every file has `"use client"`, and every component is a default export.

- `BackToFeedButton`: no props [BackToFeedButton.tsx].
- `CommunityRatings`: props `allUserRatings: UserRating[]`, `isLoadingAllRatings: boolean`, `averageRating: { average: number; count: number }`, `otherUserRatingsToDisplay: UserRating[]` [CommunityRatings.tsx].
- `CopyLinkButton`: props `jokeId: string` [CopyLinkButton.tsx].
- `ExplanationCard`: props `explanation: string`, `isExplanationLoading: boolean`, `canExplain: boolean`, `onExplain: () => void` [ExplanationCard.tsx].
- `JokeHeader`: props `joke: Joke`, `isOwner: boolean`, `isSourceUrl: boolean`, `onToggleUsed: () => void` [JokeHeader.tsx].
- `RatingForm`: props `joke`, `user: { uid: string } | null`, `currentUserRating`, `ratingInputValue`, `commentInputValue`, `isSubmittingRating`, `isLoadingCurrentUserRating`, `onRatingInputChange`, `onCommentInputChange`, `onSubmit` [RatingForm.tsx].

## Invariants

- `BackToFeedButton` starts with `href = FEED_PATH`. Only a mount effect replaces it with `readFeedUrl(window.sessionStorage)`; render never reads sessionStorage [BackToFeedButton.tsx:useEffect].
- `CommunityRatings` shows a "Loading community ratings…" spinner while `isLoadingAllRatings`. Otherwise it renders the average block only when `allUserRatings.length > 0`. When `otherUserRatingsToDisplay` is empty it renders an `EmptyState`: title "No other community feedback yet." when `allUserRatings` is non-empty, else "No community feedback yet." with the hint "Be the first to rate this one." [CommunityRatings.tsx].
- `CopyLinkButton` clears any pending reset timer after `copyToClipboard` resolves, before it handles the result. On success it shows "Copied" for `COPIED_LABEL_MS = 2000` ms. The timer is cleared on unmount, and the label icons are `aria-hidden` [CopyLinkButton.tsx:handleCopy].
- The Explain button is disabled when `isExplanationLoading || !canExplain`. A visually hidden `role="status"` paragraph announces progress and completion. The streamed explanation text is not a live region [ExplanationCard.tsx].
- The used-status `Switch` and the Edit button render only when `isOwner`. The Switch's `aria-label` is `Mark joke as ${used ? 'unused' : 'used'}`. When `isSourceUrl` is true, `joke.source` renders as an external link with `target="_blank"` and `rel="noopener noreferrer"`; otherwise it renders as text [JokeHeader.tsx].
- `RatingForm` renders the form only when `user` is set. Otherwise it shows a link to `/auth?redirect=/joke/${joke.id}`. With a user and `isLoadingCurrentUserRating`, it shows a "Loading your rating…" spinner instead of the form. The submit label is "Update Rating" when `currentUserRating` is set, "Submit Rating" otherwise, and "Submitting…" while submitting [RatingForm.tsx].
- The rating submit button is disabled when `isSubmittingRating || ratingInputValue === 0`. The comment `Textarea` has `maxLength={1000}` and `aria-describedby="user-rating-comment-count"`. `StarRating` gets `describedBy="rating-input-hint"` only while `ratingInputValue === 0` [RatingForm.tsx].

## Side Effects

- `BackToFeedButton` reads sessionStorage through `readFeedUrl` from `@/lib/feedReturn` [BackToFeedButton.tsx].
- `CopyLinkButton` writes to the clipboard through `copyToClipboard(url, navigator.clipboard)`, using the URL from `jokeShareUrl(window.location.origin, jokeId)`. Both come from `@/lib/share`. It shows toasts through `useToast` (`@/hooks/use-toast`) and starts a 2000 ms `setTimeout` [CopyLinkButton.tsx].
- The `JokeHeader` Edit button calls `router.push(`/edit-joke/${joke.id}`)` (`next/navigation`) [JokeHeader.tsx].
- `ExplanationCard`, `JokeHeader` and `RatingForm` call their `on*` callback props. The parent performs any persistence.

## Verification

- Run: `npm test`. This directory has no test files of its own.
