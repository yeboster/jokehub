/**
 * The community-rating filter, as ranges over a joke's `averageRating`.
 *
 * The feed used to filter on `funnyRate` — the score a joke's own author gave
 * it, written once at import or edit time. Starring a joke writes the
 * `jokeRatings` collection and the joke doc's `averageRating`/`ratingCount`
 * totals instead, so a joke the community rated 5 never matched the filter.
 * These buckets move the filter onto the number the cards actually show.
 *
 * Ranges, not equality: `averageRating` is a mean rounded to one decimal
 * (`ratingService.submitUserRating`), so a joke everybody loves is 4.8 or 5,
 * never exactly the integer the picker offers, and float equality would answer
 * "no jokes" to almost every choice. Strings and numbers only — `src/lib/` is
 * outside Tailwind's content globs, so nothing here may return a class name.
 */

/** `filterFunnyRate` sentinel: no rating constraint at all. */
export const ANY_RATING = -1;

/** `filterFunnyRate` sentinel: jokes nobody has rated yet. */
export const UNRATED = 0;

/** A half-open range over `averageRating`: `gte <= average < lt`, `lt` absent for unbounded. */
export interface RatingRange {
  gte: number;
  lt?: number;
}

/**
 * The unrated bucket. Not a range: "nobody has rated this" is a fact about
 * `ratingCount`, and a range constraint can never match it — an unrated joke
 * has no average, and a `ratingCount == 0` clause combined with a range on
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
 * 5 is `>= 4.5` rather than `== 5`: one 4-star rating among nine 5s averages
 * 4.9, which is what a user calling a joke five-star means. 4 stops below 4.5
 * so the two buckets do not overlap. Out-of-range values return `null` (no
 * constraint) rather than throwing — the URL parser already clamps to -1..5,
 * and a hand-edited URL should widen the feed, never break it.
 */
export function communityRatingBucket(stars: number): CommunityRatingBucket | null {
  if (stars === UNRATED) return { unrated: true };
  switch (stars) {
    case 1:
      return { gte: 1, lt: 2 };
    case 2:
      return { gte: 2, lt: 3 };
    case 3:
      return { gte: 3, lt: 4 };
    case 4:
      return { gte: 4, lt: 4.5 };
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
 * no `averageRating` at all; it reads as 0, which is below every range bucket's
 * floor, and is matched only by the unrated bucket.
 */
export function matchesCommunityRatingBucket(
  bucket: CommunityRatingBucket,
  joke: { averageRating?: number; ratingCount?: number }
): boolean {
  if (isUnratedBucket(bucket)) {
    return (joke.ratingCount ?? 0) === 0;
  }
  const average = joke.averageRating ?? 0;
  return average >= bucket.gte && (bucket.lt === undefined || average < bucket.lt);
}

/**
 * What a picker value reads as, in the dialog and on the feed's filter chip.
 *
 * Note for review: the wording is the one specified for this fix, and for 1 and
 * 4 it reads wider than the bucket it names — 1 is the 1-to-2 band, not
 * everything from one star up, and 4 stops at the point where 5 begins. The
 * bounds above are the behaviour; this is only the label, and tightening it to
 * match is a copy decision, not a code one.
 */
export function ratingBucketLabel(stars: number): string {
  switch (stars) {
    case UNRATED:
      return 'Unrated';
    case 1:
      return '1 star and up';
    case 2:
      return '2–3 stars';
    case 3:
      return '3–4 stars';
    case 4:
      return '4 stars and up';
    case 5:
      return '5 stars';
    default:
      // Every value that constrains nothing, `ANY_RATING` included.
      return 'Any rating';
  }
}
