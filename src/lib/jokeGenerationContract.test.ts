// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { JOKE_GENERATION_LIMITS, JOKE_MODES, isNearDuplicateJoke, mergeUniqueJokeTexts, normalizeJokeKey } from './jokeGenerationContract';

describe('jokeGenerationContract', () => {
  it('publishes exact browser-safe shared caps', () => {
    expect(JOKE_GENERATION_LIMITS).toEqual({ topicHintChars: 500, contextTextChars: 2000, prefilledJokes: 25, exemplarJokes: 25, recentGeneratedJokes: 12, avoidJokes: 8, libraryJokes: 1000 });
    expect(JOKE_MODES).toEqual(['original', 'classic']);
  });
  it.each([
    ['Hello world', 'hello world!', true],
    ["Why do crabs never volunteer? Because they're shell-fish", "Why don't crabs ever volunteer? They are shellfish!", true],
    ['Why did the computer go to the dentist? It had a Bluetooth infection', 'Why was the computer cold? It left its Windows open', false],
    ['Candidate 0', 'Candidate 1', false],
    ['Never trust a statistician. They are always plotting something.', 'Never trust an atom. They make up everything.', false],
  ])('near-duplicate %j vs %j is %s', (a, b, expected) => {
    expect(isNearDuplicateJoke(a, b)).toBe(expected);
    expect(isNearDuplicateJoke(b, a)).toBe(expected);
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
