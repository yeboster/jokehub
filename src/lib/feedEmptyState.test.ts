import { describe, it, expect } from 'vitest';

import { describeEmptyFeed, emptyFeedAnnouncement, type FeedEmptyInput } from '@/lib/feedEmptyState';

function input(overrides: Partial<FeedEmptyInput> = {}): FeedEmptyInput {
  return { search: '', hasMoreJokes: false, hasActiveFilters: false, ...overrides };
}

describe('describeEmptyFeed', () => {
  it('says the page, not the search, came up empty while more pages remain', () => {
    const copy = describeEmptyFeed(input({ search: 'penguin', hasMoreJokes: true, hasActiveFilters: true }));

    expect(copy.title).toBe('No jokes on this page matched “penguin”.');
    expect(copy.hint).toContain('load more');
    // No CTA: "Load More" is still enabled below, so clearing the filters
    // would abandon a search that may yet match.
    expect(copy.offerClearFilters).toBe(false);
  });

  it('names the exhausted search term and offers a way out', () => {
    const copy = describeEmptyFeed(input({ search: 'penguin', hasMoreJokes: false, hasActiveFilters: true }));

    expect(copy.title).toBe('No jokes matched “penguin”.');
    expect(copy.hint).toContain('three or more letters');
    expect(copy.offerClearFilters).toBe(true);
  });

  it('keeps a quote character in the search term unmangled', () => {
    const copy = describeEmptyFeed(input({ search: 'the "best" pun', hasActiveFilters: true }));

    expect(copy.title).toBe('No jokes matched “the "best" pun”.');
  });

  it('blames the filters only when filters are what is set', () => {
    const copy = describeEmptyFeed(input({ hasActiveFilters: true }));

    expect(copy.title).toBe('No jokes match these filters.');
    expect(copy.hint).toBe('Loosen one of them, or clear them all and start over.');
    expect(copy.offerClearFilters).toBe(true);
  });

  it('offers to clear filters even when more pages remain, if there is no search', () => {
    const copy = describeEmptyFeed(input({ hasMoreJokes: true, hasActiveFilters: true }));

    expect(copy.title).toBe('No jokes match these filters.');
    expect(copy.offerClearFilters).toBe(true);
  });

  it('never names filters when nothing is filtered', () => {
    const copy = describeEmptyFeed(input());

    expect(copy.title).toBe('No jokes here yet.');
    expect(copy.hint).toBe('Add the first one and it shows up right away.');
    expect(copy.offerClearFilters).toBe(false);
  });

  it('never offers to clear filters when nothing is filtered', () => {
    for (const hasMoreJokes of [true, false]) {
      expect(describeEmptyFeed(input({ hasMoreJokes })).offerClearFilters).toBe(false);
    }
  });

  it('reports the failure rather than the filters, search term and all', () => {
    // The error outranks every other reading of an empty list: before this,
    // a dropped connection was reported as "no jokes matched your search".
    const copy = describeEmptyFeed(
      input({ search: 'penguin', hasActiveFilters: true, error: 'Network request failed' })
    );

    expect(copy.title).toBe("We couldn't load the jokes.");
    expect(copy.hint).toBe('Network request failed. Check your connection and try again.');
    expect(copy.offerRetry).toBe(true);
    // Clearing the filters would not fix a network failure.
    expect(copy.offerClearFilters).toBe(false);
  });

  it('ends the failure hint in exactly one period, whatever the message brings', () => {
    // Including a message that ends in other terminal punctuation: an
    // exclamation mark used to be kept and a period added after it.
    const messages = [
      'Network request failed',
      'Network request failed.',
      'Network request failed!',
      'Network request failed?',
    ];

    for (const message of messages) {
      const copy = describeEmptyFeed(input({ error: message }));
      expect(copy.hint).toBe('Network request failed. Check your connection and try again.');
    }
  });

  it('treats an empty-string error as no error', () => {
    const copy = describeEmptyFeed(input({ error: '' }));

    expect(copy.title).toBe('No jokes here yet.');
    expect(copy.offerRetry).toBe(false);
  });

  it('never offers a retry when nothing failed', () => {
    const cases: Partial<FeedEmptyInput>[] = [
      {},
      { hasActiveFilters: true },
      { search: 'x', hasMoreJokes: true },
      { search: 'x', hasMoreJokes: false },
      { error: null },
    ];

    for (const override of cases) {
      expect(describeEmptyFeed(input(override)).offerRetry).toBe(false);
    }
  });

  it('always returns a title and a hint that end in a full stop', () => {
    const cases: Partial<FeedEmptyInput>[] = [
      {},
      { hasActiveFilters: true },
      { search: 'x', hasMoreJokes: true },
      { search: 'x', hasMoreJokes: false },
      { error: 'Network request failed' },
    ];

    for (const override of cases) {
      const copy = describeEmptyFeed(input(override));
      expect(copy.title.endsWith('.')).toBe(true);
      expect(copy.hint.endsWith('.')).toBe(true);
    }
  });
});

describe('emptyFeedAnnouncement', () => {
  it('reads the headline and the hint as one utterance', () => {
    expect(
      emptyFeedAnnouncement({
        title: 'No jokes match these filters.',
        hint: 'Loosen one of them, or clear them all and start over.',
        offerClearFilters: true,
        offerRetry: false,
      })
    ).toBe('No jokes match these filters. Loosen one of them, or clear them all and start over.');
  });

  it('carries the reason for a failed fetch, which is the hint on that branch', () => {
    const copy = describeEmptyFeed(input({ error: 'Network request failed' }));

    expect(emptyFeedAnnouncement(copy)).toBe(
      "We couldn't load the jokes. Network request failed. Check your connection and try again."
    );
  });

  it('is exactly the visible copy, for every branch — the region cannot contradict the screen', () => {
    const cases: Partial<FeedEmptyInput>[] = [
      {},
      { hasActiveFilters: true },
      { search: 'x', hasMoreJokes: true },
      { search: 'x', hasMoreJokes: false },
      { error: 'Network request failed' },
    ];

    for (const override of cases) {
      const copy = describeEmptyFeed(input(override));
      expect(emptyFeedAnnouncement(copy)).toBe(`${copy.title} ${copy.hint}`);
    }
  });

  it('does not leave a trailing space when there is no hint', () => {
    expect(
      emptyFeedAnnouncement({
        title: 'No jokes here yet.',
        hint: '',
        offerClearFilters: false,
        offerRetry: false,
      })
    ).toBe('No jokes here yet.');
  });

  it('never returns an empty string, which a permanently mounted region cannot announce', () => {
    expect(
      emptyFeedAnnouncement({ title: '  ', hint: '  ', offerClearFilters: false, offerRetry: false })
    ).toBe('');
  });
});
