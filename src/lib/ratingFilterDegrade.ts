/**
 * When the feed may answer a rating filter without Firestore's help.
 *
 * The rating bands are ranges over `averageRating`, and a range combined with
 * the feed's date ordering is a composite index combination this project has
 * never deployed. Until it exists, the honest options are an empty feed with an
 * error in it, or the same page of jokes with the band applied on the client.
 * The second one keeps working, so that is what the feed does — but only for
 * the one failure that means "the index is missing", and only when a band is
 * actually being asked for.
 */
import { isMissingIndexError } from '@/lib/firestoreErrors';
import { communityRatingBucket, isUnratedBucket } from '@/lib/ratingBuckets';

/**
 * True when the feed should retry without the rating constraint and apply the
 * band on the client instead.
 *
 * Both halves matter. A failure that is not a missing index (permission denied,
 * the network, a malformed query) is a real error and must reach the caller
 * exactly as it did before this existed — degrading there would turn a broken
 * feed into a quietly wrong one.
 *
 * The unrated choice is deliberately excluded: it is an equality constraint on
 * the rating count, so the fallback the feed has always had — drop the ordering
 * and sort on the client — serves it completely, with full pages and the
 * constraint still applied by the server. Giving up the constraint instead
 * would be strictly worse.
 */
export function shouldDegradeRatingFilter(
  error: unknown,
  filters: { filterFunnyRate: number }
): boolean {
  if (!isMissingIndexError(error)) return false;
  const bucket = communityRatingBucket(filters.filterFunnyRate);
  return bucket !== null && !isUnratedBucket(bucket);
}
