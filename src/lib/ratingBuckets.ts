/**
 * The community-rating filter, as lower bounds on a joke's `averageRating`.
 *
 * The feed used to filter on `funnyRate` — the score a joke's own author gave
 * it, written once at import or edit time. Starring a joke writes the
 * `jokeRatings` collection and the joke doc's `averageRating`/`ratingCount`
 * totals instead, so a joke the community rated 5 never matched the filter.
 * These buckets move the filter onto the number the cards actually show.
 *
 * Bounds, not equality: `averageRating` is a mean rounded to one decimal
 * (`ratingService.submitUserRating`), so a joke everybody loves is 4.8 or 5,
 * never exactly the integer the picker offers, and float equality would answer
 * "no jokes" to almost every choice.
 *
 * Cumulative, not banded: picking 3 means "3 stars and up", so it contains
 * everything 4 and 5 contain. The first pass made each choice a closed band
 * ([3, 4) and nothing above), which is not what a rating filter means anywhere
 * else and made two of the labels untrue — "4 stars and up" quietly stopped at
 * 4.5. Nesting the choices makes every label literally what the query does.
 * Strings and numbers only — `src/lib/` is outside Tailwind's content globs,
 * so nothing here may return a class name.
 */

/** `filterFunnyRate` sentinel: no rating constraint at all. */
export const ANY_RATING = -1;

/** `filterFunnyRate` sentinel: jokes nobody has rated yet. */
export const UNRATED = 0;

/** A lower bound on `averageRating`: `average >= gte`, open at the top. */
export interface RatingRange {
  gte: number;
}

/**
 * The unrated bucket. Not a bound: "nobody has rated this" is a fact about
 * `ratingCount`, and a bound on the average can never match it — an unrated
 * joke has no average, and a `ratingCount == 0` clause combined with a range on
 * another field would ask Firestore for documents that cannot exist.
 */
export interface UnratedBucket {
  unrated: true;
}

export type CommunityRatingBucket = RatingRange | UnratedBucket;

/** Narrows the union; the caller turns this branch into a count constraint. */
export function isUnratedBucket(bucket: CommunityRatingBucket): bucket is UnratedBucket {
  return 'unrated' in bucket;
}

/**
 * The bucket a picker value selects, or `null` for "constrain nothing".
 *
 * Each value is its own floor and nothing more, so the choices nest: 1 admits
 * every rated joke, 5 admits the fewest. 5's floor is 4.5 rather than 5 because
 * one 4-star rating among nine 5s averages 4.9, which is still what a user
 * calling a joke five-star means; that is the one place a floor is not the
 * integer on the label, and it is the only way "5 stars" matches anything at
 * all. Out-of-range values return `null` (no constraint) rather than throwing —
 * the URL parser already clamps to -1..5, and a hand-edited URL should widen
 * the feed, never break it.
 */
export function communityRatingBucket(stars: number): CommunityRatingBucket | null {
  if (stars === UNRATED) return { unrated: true };
  switch (stars) {
    case 1:
      return { gte: 1 };
    case 2:
      return { gte: 2 };
    case 3:
      return { gte: 3 };
    case 4:
      return { gte: 4 };
    case 5:
      return { gte: 4.5 };
    default:
      return null;
  }
}

/**
 * Whether a joke falls in a bucket, evaluated on the client.
 *
 * Used by the feed's missing-index fallback, so it has to agree exactly with
 * the constraints `buildJokesQuery` would have sent. A joke with no ratings has
 * no `averageRating` at all; it reads as 0, which is below every bucket's
 * floor, and is matched only by the unrated bucket.
 */
export function matchesCommunityRatingBucket(
  bucket: CommunityRatingBucket,
  joke: { averageRating?: number; ratingCount?: number }
): boolean {
  if (isUnratedBucket(bucket)) {
    return (joke.ratingCount ?? 0) === 0;
  }
  return (joke.averageRating ?? 0) >= bucket.gte;
}

/**
 * What a picker value reads as, in the dialog and on the feed's filter chip.
 *
 * "and up" is now literally true of every bound above, which is the point of
 * the cumulative bounds: the label and the query say the same thing. 5 reads
 * "5 stars" rather than "5 stars and up" because there is nothing above five —
 * it is the top choice, and it admits the 4.8s and 4.9s a five-star joke
 * actually averages.
 */
export function ratingBucketLabel(stars: number): string {
  switch (stars) {
    case UNRATED:
      return 'Unrated';
    case 1:
      return '1 star and up';
    case 2:
      return '2 stars and up';
    case 3:
      return '3 stars and up';
    case 4:
      return '4 stars and up';
    case 5:
      return '5 stars';
    default:
      // Every value that constrains nothing, `ANY_RATING` included.
      return 'Any rating';
  }
}
