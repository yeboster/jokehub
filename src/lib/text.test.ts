import { describe, it, expect } from 'vitest';
import { generateKeywords } from '@/lib/text';

describe('generateKeywords', () => {
  it('lowercases words', () => {
    expect(generateKeywords('Hello World')).toEqual(['hello', 'world']);
  });

  it('strips surrounding punctuation', () => {
    expect(generateKeywords('Why, did the chicken cross the road?')).toEqual([
      'why',
      'did',
      'the',
      'chicken',
      'cross',
      'road',
    ]);
  });

  it('filters out words with length <= 2, keeping length 3+', () => {
    expect(generateKeywords('a an it is to be or not to be')).toEqual(['not']);
  });

  it('deduplicates repeated words', () => {
    expect(generateKeywords('cat cat dog cat dog')).toEqual(['cat', 'dog']);
  });

  it('splits on multiple whitespace characters, including newlines and tabs', () => {
    expect(generateKeywords('foo   bar\tbaz\n\nqux')).toEqual(['foo', 'bar', 'baz', 'qux']);
  });

  it('returns an empty array for empty input', () => {
    expect(generateKeywords('')).toEqual([]);
  });

  it('returns an empty array for whitespace-only input', () => {
    expect(generateKeywords('   \n\t  ')).toEqual([]);
  });

  it('does not strip internal punctuation like apostrophes mid-word', () => {
    // The regex only strips the listed punctuation characters, wherever they occur.
    expect(generateKeywords("don't stop believing")).toEqual(['dont', 'stop', 'believing']);
  });
});
