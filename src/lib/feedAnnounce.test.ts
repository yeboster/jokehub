import { describe, it, expect } from 'vitest';

import {
  describeFeedAppend,
  describeFeedStatus,
  describeFeedTally,
  type FeedCountSnapshot,
  type FeedSnapshot,
} from '@/lib/feedAnnounce';

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

/** A reading of `count` jokes — or a fetch in flight — for the filter set `key`. */
function reading(count: number | null, key = 'scope=user'): FeedSnapshot {
  return { key, count };
}

/** What the empty state on screen says, which the region has to repeat verbatim. */
const EMPTY_TITLE = 'No jokes matched “penguin”.';

describe('describeFeedStatus', () => {
  it('reports the fetch while a count is unknown, with no previous reading', () => {
    expect(describeFeedStatus(null, reading(null), EMPTY_TITLE)).toBe('Loading jokes…');
  });

  it('reports the fetch while a count is unknown, over a previous result set', () => {
    expect(describeFeedStatus(reading(20), reading(null), EMPTY_TITLE)).toBe('Loading jokes…');
  });

  it('says exactly what the empty state says, so the two cannot contradict each other', () => {
    expect(describeFeedStatus(null, reading(0), EMPTY_TITLE)).toBe(EMPTY_TITLE);
    expect(describeFeedStatus(reading(12), reading(0), EMPTY_TITLE)).toBe(EMPTY_TITLE);
  });

  it('states the size of a first result set', () => {
    expect(describeFeedStatus(null, reading(12), EMPTY_TITLE)).toBe('12 jokes shown.');
  });

  it('says "joke" in the singular for a result set of one', () => {
    expect(describeFeedStatus(null, reading(1), EMPTY_TITLE)).toBe('1 joke shown.');
  });

  it('delegates an append on the same filter set to describeFeedAppend', () => {
    expect(describeFeedStatus(reading(10), reading(20), EMPTY_TITLE)).toBe(
      '10 more jokes loaded. 20 now showing.'
    );
  });

  it('states the size, not an append, when the filter set changed', () => {
    expect(describeFeedStatus(reading(10, 'scope=user'), reading(20, 'search=cat'), EMPTY_TITLE)).toBe(
      '20 jokes shown.'
    );
  });

  it('states the size when the previous reading was a fetch in flight', () => {
    expect(describeFeedStatus(reading(null), reading(12), EMPTY_TITLE)).toBe('12 jokes shown.');
  });

  it('states the size when the count shrank on the same filter set', () => {
    expect(describeFeedStatus(reading(20), reading(5), EMPTY_TITLE)).toBe('5 jokes shown.');
  });

  it('never returns an empty string, which the region could not announce', () => {
    const transitions: Array<[FeedSnapshot | null, FeedSnapshot]> = [
      [null, reading(null)],
      [reading(20), reading(null)],
      [null, reading(0)],
      [reading(12), reading(0)],
      [null, reading(1)],
      [null, reading(12)],
      [reading(10), reading(20)],
      [reading(10, 'scope=user'), reading(20, 'search=cat')],
      [reading(null), reading(12)],
      [reading(20), reading(5)],
      [reading(12), reading(12)],
    ];
    for (const [previous, next] of transitions) {
      expect(describeFeedStatus(previous, next, EMPTY_TITLE)).not.toBe('');
    }
  });
});

describe('describeFeedTally', () => {
  it('says nothing for an empty result set, which the empty state already covers', () => {
    expect(describeFeedTally(0, true)).toBe('');
    expect(describeFeedTally(0, false)).toBe('');
  });

  it('says nothing for a count below zero, which cannot be shown', () => {
    expect(describeFeedTally(-1, false)).toBe('');
  });

  it('says "joke" in the singular for a complete set of one', () => {
    expect(describeFeedTally(1, false)).toBe('Showing all 1 joke.');
  });

  it('says "joke" in the singular for a first page of one', () => {
    expect(describeFeedTally(1, true)).toBe('Showing 1 joke so far.');
  });

  it('reports the running total while more pages exist', () => {
    expect(describeFeedTally(24, true)).toBe('Showing 24 jokes so far.');
  });

  it('reports the whole set once it is exhausted', () => {
    expect(describeFeedTally(24, false)).toBe('Showing all 24 jokes.');
  });
});
