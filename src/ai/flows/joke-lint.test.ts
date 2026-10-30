// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { lintJoke } from './joke-lint';

describe('lintJoke', () => {
  // Real jokes the user rated five stars must stay clean.
  it.each([
    ['Never trust a statistician. They’re always plotting something.', 'plotting something'],
    ['How does NASA organize a party? They planet.', 'planet'],
    ["I don't trust stairs. They're always up to something.", 'up to something'],
    ['What did Harry Potter say when he filled up his gas tank?\n“Expensive Petroleum.”', 'Expensive Petroleum'],
    ['What seven-letter word starts with “egg” and ends with “soup”?\nChicken.', 'Chicken'],
    ['What is a tree’s least favorite month?\nSep-timber', 'Sep-timber'],
    ["Users' passwords are like underwear. Change them often.", undefined],
  ])('accepts %j', (text, hinge) => {
    expect(lintJoke(text, hinge)).toEqual([]);
  });

  // Saved AI jokes that show the habits the prompt now forbids.
  it.each([
    ["Why did the old bicycle decide to become an environmentalist? Because it wanted to be part of the 're-cycle' movement!", 're-cycle', ['exclamation', 'marked-pun']],
    ['What did the former astronaut say about his demission? He just needed some space from his old mission, it was getting too de-manding!', 'space', ['too-long', 'exclamation', 'trailing-explanation']],
    ['Why did the computer apply for a job as a comedian? Because it wanted a chance to really show off its *hard drive*!', 'hard drive', ['too-long', 'exclamation', 'marked-pun']],
    ["Why did the potato get so excited for Friday? Because it knew it was its turn to be a ‘fry day’", 'fry day', ['too-long', 'marked-pun']],
  ])('flags %j', (text, hinge, issues) => {
    expect(lintJoke(text, hinge)).toEqual(issues);
  });

  it.each([
    [Array.from({ length: 20 }, () => 'word').join(' '), []],
    [Array.from({ length: 21 }, () => 'word').join(' '), ['too-long']],
    ['- Word — word, word.', []],
  ])('counts only words toward the 20-word limit: %j', (text, issues) => {
    expect(lintJoke(text)).toEqual(issues);
  });

  it('only judges trailing explanation when the hinge appears in the joke', () => {
    expect(lintJoke('A short joke about absolutely nothing at all here.', 'missing')).toEqual([]);
    expect(lintJoke('The hinge lands, then three words.', 'lands')).toEqual([]);
    expect(lintJoke('The hinge lands and then four more words.', 'lands')).toEqual(['trailing-explanation']);
  });
});
