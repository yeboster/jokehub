// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { JOKE_GENERATION_LIMITS, mergeUniqueJokeTexts, normalizeJokeKey } from './jokeGenerationContract';

describe('jokeGenerationContract', () => {
  it('publishes exact browser-safe shared caps', () => {
    expect(JOKE_GENERATION_LIMITS).toEqual({ topicHintChars: 500, contextTextChars: 2000, prefilledJokes: 25, exemplarJokes: 10, recentGeneratedJokes: 12 });
  });
  it.each([
    [' ＨＥＬＬＯ!!!\n World  ', 'hello world'],
    ['one-two', 'onetwo'], ['One, two?', 'one two'], ['!!! \t', ''],
    ['École  中文  １２', 'école 中文 12'], ['e\u0301cole', 'école'], ['  A\tB\nC ', 'a b c'],
  ])('normalizes %j to %j', (text, key) => { expect(normalizeJokeKey(text)).toBe(key); });
  it('preserves primary priority, original text and stable order while skipping empty keys', () => {
    expect(mergeUniqueJokeTexts(['!!!', ' Ａ joke!', 'Second'], ['a joke', 'SECOND!!', 'Third', 'Fourth'], 3)).toEqual([' Ａ joke!', 'Second', 'Third']);
  });
  it('handles empty lists, zero cap and exhausted unique pool without padding', () => {
    expect(mergeUniqueJokeTexts([], [], 10)).toEqual([]);
    expect(mergeUniqueJokeTexts(['one'], ['two'], 0)).toEqual([]);
    expect(mergeUniqueJokeTexts(['one'], ['ONE!'], 10)).toEqual(['one']);
  });
  it('does not silently truncate oversized text; input owners must validate', () => {
    const long = 'x'.repeat(2001);
    expect(mergeUniqueJokeTexts([long], [], 1)).toEqual([long]);
  });
});
