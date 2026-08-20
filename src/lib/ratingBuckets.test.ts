import { describe, it, expect } from 'vitest';

import {
  ANY_RATING,
  UNRATED,
  communityRatingBucket,
  isUnratedBucket,
  matchesCommunityRatingBucket,
  ratingBucketLabel,
  type CommunityRatingBucket,
} from '@/lib/ratingBuckets';

/** The bucket for a picker value, failing loudly when there isn't one. */
function bucketOf(stars: number): CommunityRatingBucket {
  const bucket = communityRatingBucket(stars);
  if (!bucket) throw new Error(`expected a bucket for ${stars}`);
  return bucket;
}

describe('communityRatingBucket', () => {
  it('constrains nothing for the "any rating" sentinel', () => {
    expect(communityRatingBucket(ANY_RATING)).toBeNull();
  });

  it('returns the unrated bucket for 0, which is a count and not a range', () => {
    const bucket = bucketOf(UNRATED);
    expect(isUnratedBucket(bucket)).toBe(true);
    expect(bucket).toEqual({ unrated: true });
  });

  it.each([
    [1, { gte: 1, lt: 2 }],
    [2, { gte: 2, lt: 3 }],
    [3, { gte: 3, lt: 4 }],
    [4, { gte: 4, lt: 4.5 }],
  ])('maps %i to a bounded range', (stars, expected) => {
    expect(communityRatingBucket(stars)).toEqual(expected);
  });

  it('leaves the 5-star bucket open at the top, starting at 4.5', () => {
    expect(communityRatingBucket(5)).toEqual({ gte: 4.5 });
    expect(isUnratedBucket(bucketOf(5))).toBe(false);
  });

  it('leaves no gap and no overlap between neighbouring buckets', () => {
    for (const stars of [1, 2, 3, 4]) {
      const lower = bucketOf(stars) as { gte: number; lt: number };
      const upper = bucketOf(stars + 1) as { gte: number };
      expect(lower.lt).toBe(upper.gte);
    }
  });

  it('constrains nothing for a value outside the picker, rather than throwing', () => {
    for (const stars of [-2, 6, 4.5, Number.NaN]) {
      expect(communityRatingBucket(stars)).toBeNull();
    }
  });
});

describe('matchesCommunityRatingBucket', () => {
  it('puts 4.49 in the 4 bucket and 4.5 in the 5 bucket', () => {
    expect(matchesCommunityRatingBucket(bucketOf(4), { averageRating: 4.49, ratingCount: 3 })).toBe(true);
    expect(matchesCommunityRatingBucket(bucketOf(5), { averageRating: 4.49, ratingCount: 3 })).toBe(false);
    expect(matchesCommunityRatingBucket(bucketOf(4), { averageRating: 4.5, ratingCount: 3 })).toBe(false);
    expect(matchesCommunityRatingBucket(bucketOf(5), { averageRating: 4.5, ratingCount: 3 })).toBe(true);
  });

  it('matches a perfect 5.0 in the 5 bucket — the case that started this fix', () => {
    expect(matchesCommunityRatingBucket(bucketOf(5), { averageRating: 5, ratingCount: 2 })).toBe(true);
  });

  it('includes each range floor and excludes its ceiling', () => {
    expect(matchesCommunityRatingBucket(bucketOf(1), { averageRating: 1, ratingCount: 1 })).toBe(true);
    expect(matchesCommunityRatingBucket(bucketOf(1), { averageRating: 1.9, ratingCount: 1 })).toBe(true);
    expect(matchesCommunityRatingBucket(bucketOf(1), { averageRating: 2, ratingCount: 1 })).toBe(false);
    expect(matchesCommunityRatingBucket(bucketOf(2), { averageRating: 2, ratingCount: 1 })).toBe(true);
    expect(matchesCommunityRatingBucket(bucketOf(3), { averageRating: 3.9, ratingCount: 4 })).toBe(true);
    expect(matchesCommunityRatingBucket(bucketOf(3), { averageRating: 4, ratingCount: 4 })).toBe(false);
  });

  it('reads a joke with no average as 0, so no range bucket claims it', () => {
    for (const stars of [1, 2, 3, 4, 5]) {
      expect(matchesCommunityRatingBucket(bucketOf(stars), {})).toBe(false);
    }
  });

  it('matches only an uncounted joke in the unrated bucket', () => {
    expect(matchesCommunityRatingBucket(bucketOf(UNRATED), {})).toBe(true);
    expect(matchesCommunityRatingBucket(bucketOf(UNRATED), { ratingCount: 0 })).toBe(true);
    expect(matchesCommunityRatingBucket(bucketOf(UNRATED), { averageRating: 4.8, ratingCount: 5 })).toBe(false);
  });

  it('ignores the count for a range bucket, as the query does', () => {
    expect(matchesCommunityRatingBucket(bucketOf(5), { averageRating: 5 })).toBe(true);
  });

  it('assigns every one-decimal average to exactly one bucket', () => {
    for (let tenths = 10; tenths <= 50; tenths++) {
      const averageRating = tenths / 10;
      const matches = [1, 2, 3, 4, 5].filter((stars) =>
        matchesCommunityRatingBucket(bucketOf(stars), { averageRating, ratingCount: 1 })
      );
      expect(matches).toHaveLength(1);
    }
  });
});

describe('ratingBucketLabel', () => {
  it('labels the two sentinels', () => {
    expect(ratingBucketLabel(ANY_RATING)).toBe('Any rating');
    expect(ratingBucketLabel(UNRATED)).toBe('Unrated');
  });

  it('labels every star value the picker offers', () => {
    expect(ratingBucketLabel(1)).toBe('1 star and up');
    expect(ratingBucketLabel(2)).toBe('2–3 stars');
    expect(ratingBucketLabel(3)).toBe('3–4 stars');
    expect(ratingBucketLabel(4)).toBe('4 stars and up');
    expect(ratingBucketLabel(5)).toBe('5 stars');
  });

  it('falls back to the unconstrained label for a value that constrains nothing', () => {
    for (const stars of [-2, 6, 4.5]) {
      expect(communityRatingBucket(stars)).toBeNull();
      expect(ratingBucketLabel(stars)).toBe('Any rating');
    }
  });

  it('gives every picker value a distinct label', () => {
    const labels = [ANY_RATING, UNRATED, 1, 2, 3, 4, 5].map(ratingBucketLabel);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
