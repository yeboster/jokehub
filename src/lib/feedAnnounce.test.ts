import { describe, it, expect } from 'vitest';

import { describeFeedAppend, type FeedCountSnapshot } from '@/lib/feedAnnounce';

/** A snapshot of `count` jokes answering the filter set `key`. */
function snapshot(count: number, key = 'scope=user'): FeedCountSnapshot {
  return { key, count };
}

describe('describeFeedAppend', () => {
  it('says nothing for the first snapshot, because there is no transition yet', () => {
    expect(describeFeedAppend(null, snapshot(10))).toBe('');
  });

  it('says nothing when the filter set changed — that is a new result set, not an append', () => {
    expect(describeFeedAppend(snapshot(10, 'scope=user'), snapshot(30, 'search=cat'))).toBe('');
  });

  it('says nothing when the filter set changed to no filters at all', () => {
    expect(describeFeedAppend(snapshot(10, 'usageStatus=used'), snapshot(24, ''))).toBe('');
  });

  it('says nothing for the first page of a filter set, which is not "more"', () => {
    expect(describeFeedAppend(snapshot(0), snapshot(10))).toBe('');
  });

  it('says nothing when the count did not move', () => {
    expect(describeFeedAppend(snapshot(20), snapshot(20))).toBe('');
  });

  it('says nothing when the count shrank', () => {
    expect(describeFeedAppend(snapshot(20), snapshot(10))).toBe('');
  });

  it('reports the number added and the new total for a full page', () => {
    expect(describeFeedAppend(snapshot(10), snapshot(20))).toBe(
      '10 more jokes loaded. 20 now showing.'
    );
  });

  it('says "joke" in the singular for a final page of one', () => {
    expect(describeFeedAppend(snapshot(20), snapshot(21))).toBe(
      '1 more joke loaded. 21 now showing.'
    );
  });

  it('compares against the previous count, not against a page size', () => {
    expect(describeFeedAppend(snapshot(20), snapshot(27))).toBe(
      '7 more jokes loaded. 27 now showing.'
    );
  });

  it('treats two empty keys as the same filter set', () => {
    expect(describeFeedAppend(snapshot(8, ''), snapshot(16, ''))).toBe(
      '8 more jokes loaded. 16 now showing.'
    );
  });
});
