import { describe, it, expect } from 'vitest';

import { shouldDegradeRatingFilter } from '@/lib/ratingFilterDegrade';

/** A Firestore error as the SDK reports a missing composite index. */
function missingIndexError() {
  const error = new Error(
    'The query requires an index. You can create it here: https://console.firebase.google.com/project/x/firestore/indexes?create_composite=abc'
  );
  (error as Error & { code?: string }).code = 'failed-precondition';
  return error;
}

describe('shouldDegradeRatingFilter', () => {
  it('degrades a rating band whose index is missing', () => {
    for (const filterFunnyRate of [1, 2, 3, 4, 5]) {
      expect(shouldDegradeRatingFilter(missingIndexError(), { filterFunnyRate })).toBe(true);
    }
  });

  it('recognises the failure by its message alone, without the code', () => {
    expect(
      shouldDegradeRatingFilter(new Error('FAILED_PRECONDITION: The query requires an index.'), {
        filterFunnyRate: 5,
      })
    ).toBe(true);
  });

  it('leaves every other failure to the caller', () => {
    const permissionDenied = Object.assign(new Error('Missing or insufficient permissions.'), {
      code: 'permission-denied',
    });
    const offline = Object.assign(new Error('Failed to get documents from server.'), {
      code: 'unavailable',
    });

    expect(shouldDegradeRatingFilter(permissionDenied, { filterFunnyRate: 5 })).toBe(false);
    expect(shouldDegradeRatingFilter(offline, { filterFunnyRate: 5 })).toBe(false);
    expect(shouldDegradeRatingFilter(new Error('boom'), { filterFunnyRate: 5 })).toBe(false);
    expect(shouldDegradeRatingFilter('boom', { filterFunnyRate: 5 })).toBe(false);
    expect(shouldDegradeRatingFilter(undefined, { filterFunnyRate: 5 })).toBe(false);
  });

  it('does not degrade when no rating band is being asked for', () => {
    expect(shouldDegradeRatingFilter(missingIndexError(), { filterFunnyRate: -1 })).toBe(false);
  });

  // The unrated choice is an equality constraint on the rating count, which the
  // feed's original fallback — drop the ordering, sort on the client — answers
  // in full, with the constraint still applied by the server.
  it('does not degrade the unrated choice, which the ordering fallback serves', () => {
    expect(shouldDegradeRatingFilter(missingIndexError(), { filterFunnyRate: 0 })).toBe(false);
  });

  it('does not degrade a value that constrains nothing', () => {
    for (const filterFunnyRate of [-2, 6, 4.5]) {
      expect(shouldDegradeRatingFilter(missingIndexError(), { filterFunnyRate })).toBe(false);
    }
  });
});
