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
    [1, { gte: 1 }],
    [2, { gte: 2 }],
    [3, { gte: 3 }],
    [4, { gte: 4 }],
  ])('maps %i to that many stars and up — a floor with no ceiling', (stars, expected) => {
    expect(communityRatingBucket(stars)).toEqual(expected);
  });

  it('floors the 5-star bucket at 4.5, so a 4.9 average counts as five stars', () => {
    expect(communityRatingBucket(5)).toEqual({ gte: 4.5 });
    expect(isUnratedBucket(bucketOf(5))).toBe(false);
  });

  it('gives no bucket an upper bound', () => {
    for (const stars of [1, 2, 3, 4, 5]) {
      expect(Object.keys(bucketOf(stars))).toEqual(['gte']);
    }
  });

  it('raises the floor with every step up the picker', () => {
    for (const stars of [1, 2, 3, 4]) {
      const lower = bucketOf(stars) as { gte: number };
      const upper = bucketOf(stars + 1) as { gte: number };
      expect(upper.gte).toBeGreaterThan(lower.gte);
    }
  });

  it('constrains nothing for a value outside the picker, rather than throwing', () => {
    for (const stars of [-2, 6, 4.5, Number.NaN]) {
      expect(communityRatingBucket(stars)).toBeNull();
    }
  });
});

describe('matchesCommunityRatingBucket', () => {
  it('takes 4.5 as five stars and 4.49 as not, while 4 keeps both', () => {
    expect(matchesCommunityRatingBucket(bucketOf(5), { averageRating: 4.5, ratingCount: 3 })).toBe(true);
    expect(matchesCommunityRatingBucket(bucketOf(5), { averageRating: 4.49, ratingCount: 3 })).toBe(false);
    expect(matchesCommunityRatingBucket(bucketOf(4), { averageRating: 4.5, ratingCount: 3 })).toBe(true);
    expect(matchesCommunityRatingBucket(bucketOf(4), { averageRating: 4.49, ratingCount: 3 })).toBe(true);
  });

  it('matches a perfect 5.0 in the 5 bucket — the case that started this fix', () => {
    expect(matchesCommunityRatingBucket(bucketOf(5), { averageRating: 5, ratingCount: 2 })).toBe(true);
  });

  it('includes each floor and everything above it', () => {
    expect(matchesCommunityRatingBucket(bucketOf(1), { averageRating: 1, ratingCount: 1 })).toBe(true);
    expect(matchesCommunityRatingBucket(bucketOf(1), { averageRating: 0.9, ratingCount: 1 })).toBe(false);
    expect(matchesCommunityRatingBucket(bucketOf(2), { averageRating: 2, ratingCount: 1 })).toBe(true);
    expect(matchesCommunityRatingBucket(bucketOf(3), { averageRating: 3.9, ratingCount: 4 })).toBe(true);
    expect(matchesCommunityRatingBucket(bucketOf(3), { averageRating: 2.9, ratingCount: 4 })).toBe(false);
  });

  it('keeps a top-rated joke in every bucket below it — the choices nest', () => {
    // What "3 stars and up" promises: a joke the community loves is still in
    // the answer. The first pass banded 3 as [3, 4) and dropped it.
    for (const stars of [1, 2, 3, 4, 5]) {
      expect(matchesCommunityRatingBucket(bucketOf(stars), { averageRating: 5, ratingCount: 9 })).toBe(true);
    }
  });

  it('reads a joke with no average as 0, so no rated bucket claims it', () => {
    for (const stars of [1, 2, 3, 4, 5]) {
      expect(matchesCommunityRatingBucket(bucketOf(stars), {})).toBe(false);
    }
  });

  it('matches only an uncounted joke in the unrated bucket', () => {
    expect(matchesCommunityRatingBucket(bucketOf(UNRATED), {})).toBe(true);
    expect(matchesCommunityRatingBucket(bucketOf(UNRATED), { ratingCount: 0 })).toBe(true);
    expect(matchesCommunityRatingBucket(bucketOf(UNRATED), { averageRating: 4.8, ratingCount: 5 })).toBe(false);
  });

  it('ignores the count for a rated bucket, as the query does', () => {
    expect(matchesCommunityRatingBucket(bucketOf(5), { averageRating: 5 })).toBe(true);
  });

  it('matches an unbroken run of buckets from 1 for every one-decimal average', () => {
    // Cumulative bounds mean the buckets an average matches are a prefix of the
    // picker: never a gap, never a bucket matched without the ones below it.
    for (let tenths = 10; tenths <= 50; tenths++) {
      const averageRating = tenths / 10;
      const matched = [1, 2, 3, 4, 5].filter((stars) =>
        matchesCommunityRatingBucket(bucketOf(stars), { averageRating, ratingCount: 1 })
      );
      expect(matched.length).toBeGreaterThan(0);
      expect(matched).toEqual([1, 2, 3, 4, 5].slice(0, matched.length));
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
    expect(ratingBucketLabel(2)).toBe('2 stars and up');
    expect(ratingBucketLabel(3)).toBe('3 stars and up');
    expect(ratingBucketLabel(4)).toBe('4 stars and up');
    expect(ratingBucketLabel(5)).toBe('5 stars');
  });

  it('says "and up" only where the bucket really is open upward from its own floor', () => {
    // The labels are the contract now, so they are asserted against the bounds
    // rather than against a hand-written string: 1-4 name their own floor, and
    // 5 is the top choice, which is why it does not say "and up".
    for (const stars of [1, 2, 3, 4]) {
      const bucket = communityRatingBucket(stars) as { gte: number };
      expect(bucket.gte).toBe(stars);
      expect(ratingBucketLabel(stars)).toContain('and up');
    }
    expect(ratingBucketLabel(5)).not.toContain('and up');
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
