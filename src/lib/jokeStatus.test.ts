import { describe, it, expect } from 'vitest';

import {
  describeJokeLoadResult,
  JOKE_NOT_FOUND_HINT,
  JOKE_NOT_FOUND_TITLE,
} from '@/lib/jokeStatus';

describe('describeJokeLoadResult', () => {
  it('says nothing when the joke loaded — the heading and the route title already speak', () => {
    expect(describeJokeLoadResult({ found: true })).toBe('');
    expect(describeJokeLoadResult({ found: true, error: null })).toBe('');
  });

  it('reads the whole empty state when there is no such joke', () => {
    expect(describeJokeLoadResult({ found: false })).toBe(
      `${JOKE_NOT_FOUND_TITLE} ${JOKE_NOT_FOUND_HINT}`
    );
  });

  it('reports a failed load in the words the page shows', () => {
    expect(describeJokeLoadResult({ found: false, error: 'Failed to load the joke.' })).toBe(
      'Failed to load the joke.'
    );
  });

  it('lets a failure outrank a missing joke — the cause the user can act on wins', () => {
    expect(describeJokeLoadResult({ found: true, error: 'Joke ID is missing.' })).toBe(
      'Joke ID is missing.'
    );
  });

  it('gives the error exactly one terminal full stop, whatever it ended in', () => {
    expect(describeJokeLoadResult({ found: false, error: 'Network request failed' })).toBe(
      'Network request failed.'
    );
    // Any terminal punctuation is replaced, not just a period — matching
    // `feedEmptyState`, where a period-only rule left "Failed!" as "Failed!.".
    expect(describeJokeLoadResult({ found: false, error: 'Failed!' })).toBe('Failed.');
    expect(describeJokeLoadResult({ found: false, error: 'Failed.' })).toBe('Failed.');
  });

  it('never announces a bare blank, which a mounted region cannot announce anyway', () => {
    expect(describeJokeLoadResult({ found: false, error: '   ' })).toBe(
      `${JOKE_NOT_FOUND_TITLE} ${JOKE_NOT_FOUND_HINT}`
    );
  });
});
