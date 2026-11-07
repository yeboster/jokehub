// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  compareSelections, hasRepairTrigger, parseCriticRankings, repairFeedback, selectJokes,
  type CriticOutput, type JokeSelection,
} from './joke-selection';

const jokes = Array.from({ length: 6 }, (_, index) => ({ jokeText: `Joke ${index}`, category: 'Test' }));
function verdict(scores = [8, 8, 8, 8, 8, 8], premises = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'], mechanisms = ['m0', 'm1', 'm2', 'm3', 'm4', 'm5']): CriticOutput {
  return { rankings: scores.map((score, index) => ({ index, score, reason: 'Actionable feedback', safeForGeneralAudience: true, fitsRequest: true, original: true, premiseKey: premises[index] ?? `p${index}`, mechanismKey: mechanisms[index] ?? `m${index}` })) };
}
const selection = (fields: Partial<JokeSelection> = {}): JokeSelection => ({ jokes: jokes.slice(0, 3), objective: 20, scoreSum: 23, premiseCount: 2, mechanismCount: 2, indices: [0, 2, 3], ...fields });

describe('joke-selection penalized subset search', () => {
  it('uses numeric penalties to favor modest diversity benefit without discarding quality', () => {
    const output = selectJokes(jokes, verdict([9, 9, 9, 8, 1, 1], ['same', 'same', 'same', 'different', 'p4', 'p5'], ['same', 'same', 'same', 'different', 'm4', 'm5']), []);
    expect(output).toMatchObject({ indices: [0, 1, 3], scoreSum: 26, premiseCount: 2, mechanismCount: 2, objective: 23 });
    expect(output?.jokes).toEqual([jokes[0], jokes[1], jokes[3]]);
  });
  it('strong homogeneous triple beats weak diverse options; redundancy alone never causes scarcity', () => {
    const output = selectJokes(jokes, verdict([10, 10, 10, 1, 1, 1], ['same', 'same', 'same', 'p3', 'p4', 'p5'], ['same', 'same', 'same', 'm3', 'm4', 'm5']), []);
    expect(output).toMatchObject({ indices: [0, 1, 2], scoreSum: 30, premiseCount: 1, mechanismCount: 1, objective: 24 });
  });
  it('equal objective prefers raw score sum, not descriptor diversity', () => {
    const output = selectJokes(jokes, verdict([10, 10, 10, 7, 1, 1], ['same', 'same', 'same', 'p3', 'p4', 'p5'], ['same', 'same', 'same', 'm3', 'm4', 'm5']), []);
    expect(output?.indices).toEqual([0, 1, 2]); // 30-6 equals 27-3.
  });
  it('normalizes descriptors before computing redundancy', () => {
    const output = selectJokes(jokes, verdict([10, 10, 10, 1, 1, 1], ['ＳＡＭＥ', 'same!', ' Same ', 'p3', 'p4', 'p5'], ['Ｍ', 'm!', ' M ', 'm3', 'm4', 'm5']), []);
    expect(output).toMatchObject({ objective: 24, premiseCount: 1, mechanismCount: 1 });
  });
  it('lexical index tie is stable under shuffled verdicts, output sorted score then explicit index', () => {
    const assessment = verdict(); assessment.rankings.reverse();
    expect(selectJokes(jokes, assessment, [])?.indices).toEqual([0, 1, 2]);
    const mixed = verdict([8, 9, 8, 1, 1, 1]); mixed.rankings.reverse();
    expect(selectJokes(jokes, mixed, [])?.jokes).toEqual([jokes[1], jokes[0], jokes[2]]);
  });
  it('does not greedily keep lower-scoring first duplicate', () => {
    const texts = jokes.map(c => ({ ...c })); texts[0].jokeText = 'hello-world!'; texts[1].jokeText = 'ＨＥＬＬＯＷＯＲＬＤ';
    expect(selectJokes(texts, verdict([5, 10, 9, 8, 1, 1]), [])?.indices).toEqual([1, 2, 3]);
  });
  it.each(['shape', 'empty', 'reference', 'gates'] as const)('returns a partial subset when only two jokes are eligible: %s', (kind) => {
    const texts = jokes.map(c => ({ ...c })); const assessment = verdict();
    let references: string[] = [];
    if (kind === 'shape') texts.slice(2).forEach(c => { c.category = ' '; });
    if (kind === 'empty') texts.slice(2).forEach(c => { c.jokeText = '!!!'; });
    if (kind === 'reference') references = texts.slice(2).map(c => c.jokeText.toUpperCase() + '!');
    if (kind === 'gates') assessment.rankings.slice(2).forEach(r => { r.original = false; });
    expect(selectJokes(texts, assessment, references)).toMatchObject({ indices: [0, 1], jokes: [jokes[0], jokes[1]] });
  });
  it('treats normalized duplicates as one joke and returns null when nothing is eligible', () => {
    const same = jokes.map(c => ({ ...c, jokeText: 'same' }));
    expect(selectJokes(same, verdict(), [])?.jokes).toEqual([same[0]]);
    const gated = verdict(); gated.rankings.forEach(r => { r.safeForGeneralAudience = false; });
    expect(selectJokes(jokes, gated, [])).toBeNull();
  });
  it('unranked candidates are ineligible', () => {
    const assessment = verdict([9, 9, 9, 9, 9, 9]);
    assessment.rankings = assessment.rankings.filter(r => r.index !== 0);
    expect(selectJokes(jokes, assessment, [], [], 3)?.indices).toEqual([1, 2, 3]);
  });
  it('count 1 picks the single best joke', () => {
    expect(selectJokes(jokes, verdict([5, 7, 9, 9, 2, 1]), [], [], 1)).toMatchObject({ indices: [2], jokes: [jokes[2]], objective: 9 });
  });
  it('count 5 searches subsets of ten candidates with proportional redundancy penalties', () => {
    const ten = Array.from({ length: 10 }, (_, index) => ({ jokeText: `Ten ${index}`, category: 'Test' }));
    const premises = ['a', 'a', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const output = selectJokes(ten, verdict([10, 10, 10, 9, 9, 9, 8, 1, 1, 1], premises, ten.map((_, i) => `m${i}`)), [], [], 5);
    // 48 with three "a" premises costs 4 (=44); 47 with two costs 2 (=45) and
    // ties 45 with no repeats (10+9+9+9+8), winning on raw score sum.
    expect(output).toMatchObject({ indices: [0, 1, 3, 4, 5], scoreSum: 47, premiseCount: 4, mechanismCount: 5, objective: 45 });
    expect(output?.jokes).toHaveLength(5);
  });
  it('count 1 applies the lint penalty and the library near-duplicate filter', () => {
    const texts = jokes.map(c => ({ ...c }));
    texts[0].jokeText = 'Joke zero shouts at the end!'; // exclamation: −2
    texts[1].jokeText = 'The library already has this exact joke about cheese';
    const output = selectJokes(texts, verdict([9, 9, 8, 1, 1, 1]), [], ['The library already has this exact joke about cheese.'], 1);
    expect(output).toMatchObject({ indices: [2], scoreSum: 8 });
  });
  it('count larger than eligible returns every eligible joke', () => {
    const assessment = verdict(); assessment.rankings.slice(3).forEach(r => { r.fitsRequest = false; });
    expect(selectJokes(jokes, assessment, [], [], 5)?.indices).toEqual([0, 1, 2]);
  });
  it.each([
    ['objective', { objective: 21, scoreSum: 1, premiseCount: 1, mechanismCount: 1, indices: [3, 4, 5] }],
    ['scoreSum', { scoreSum: 24, premiseCount: 1, mechanismCount: 1, indices: [3, 4, 5] }],
    ['premiseCount', { premiseCount: 3, mechanismCount: 1, indices: [3, 4, 5] }],
    ['mechanismCount', { mechanismCount: 3, indices: [3, 4, 5] }],
    ['indexTuple', { indices: [0, 1, 5] }],
  ] as const)('comparator tie-break priority %s', (_, fields) => {
    const left = selection({ ...fields, indices: fields.indices ? [...fields.indices] : [0, 2, 3] });
    expect(compareSelections(left, selection())).toBeGreaterThan(0);
    expect(compareSelections(selection(), left)).toBeLessThan(0);
    expect(compareSelections(left, left)).toBe(0);
  });
  it('compares explicit index tuple lexicographically, not by sum', () => {
    expect(compareSelections(selection({ indices: [0, 4, 5] }), selection({ indices: [1, 2, 3] }))).toBeGreaterThan(0);
  });
  it('a fuller selection beats a smaller one with a higher objective', () => {
    const full = selection({ objective: 10 });
    const partial = selection({ jokes: jokes.slice(0, 2), indices: [0, 1], objective: 19 });
    expect(compareSelections(full, partial)).toBeGreaterThan(0);
    expect(compareSelections(partial, full)).toBeLessThan(0);
  });
});

describe('tolerant critic parsing', () => {
  const row = (index: unknown, fields: Record<string, unknown> = {}) => ({ ...verdict().rankings[0], index, ...fields });
  it('accepts a full permutation in any order', () => {
    const assessment = verdict(); assessment.rankings.reverse();
    expect(parseCriticRankings(assessment, 6)?.rankings.map(r => r.index).sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });
  it('drops invalid, out-of-range and non-integer indices and keeps the first valid row per index', () => {
    const parsed = parseCriticRankings({ rankings: [
      row(0, { score: 11 }), row(0, { score: 7 }), row(0, { score: 3 }), row(6), row(0.5), row(-1), row('1'), row(2),
    ] }, 6);
    expect(parsed?.rankings).toEqual([expect.objectContaining({ index: 0, score: 7 }), expect.objectContaining({ index: 2 })]);
  });
  it.each([
    ['safeForGeneralAudience', 'true'], ['fitsRequest', 1], ['original', null], ['score', NaN], ['score', Infinity],
    ['score', 0], ['score', 11], ['reason', '  '], ['reason', 'x'.repeat(501)],
    ['premiseKey', '!!!'], ['mechanismKey', ''], ['premiseKey', 'x'.repeat(81)],
  ])('drops a row with malformed %s=%s and keeps the rest', (key, value) => {
    const assessment = verdict(); Object.assign(assessment.rankings[0], { [key]: value });
    expect(parseCriticRankings(assessment, 6)?.rankings.map(r => r.index)).toEqual([1, 2, 3, 4, 5]);
  });
  it('trims reasons/descriptors and accepts exact bounds', () => {
    const assessment = verdict(); Object.assign(assessment.rankings[0], { reason: 'x'.repeat(500), premiseKey: 'y'.repeat(80), mechanismKey: '  m  ' });
    expect(parseCriticRankings(assessment, 6)?.rankings[0].mechanismKey).toBe('m');
  });
  it.each([null, 'bad', {}, { rankings: 'bad' }, { rankings: [] }, { rankings: [row(9), row(0, { score: 0 })] }])('zero valid rankings is a critic failure: %j', (output) => {
    expect(parseCriticRankings(output, 6)).toBeNull();
  });
});

describe('bounded repair feedback', () => {
  it('feedback includes one entry per ranked candidate in index order with deterministic duplication annotations', () => {
    const texts = jokes.map(c => ({ ...c })); texts[1].jokeText = 'JOKE 0!';
    const assessment = verdict(); assessment.rankings.reverse();
    const feedback = repairFeedback(texts, assessment, ['joke 0']);
    expect(feedback).toHaveLength(6);
    expect(feedback.map(r => r.index)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(feedback[0].duplicateFailure).toBe('candidate-and-reference');
    expect(feedback[1].duplicateFailure).toBe('candidate-and-reference');
    expect(feedback[2].duplicateFailure).toBe('none');
    expect(Object.keys(feedback[0]).sort()).toEqual(['index', 'score', 'reason', 'safeForGeneralAudience', 'fitsRequest', 'original', 'premiseKey', 'mechanismKey', 'jokeText', 'duplicateFailure', 'lintIssues', 'adjustedScore'].sort());
  });
  it('no repair trigger from homogeneous descriptors alone or score above 4', () => {
    expect(hasRepairTrigger(jokes, verdict([4.1, 5, 5, 5, 5, 5], Array(6).fill('same'), Array(6).fill('same')), [])).toBe(false);
    expect(hasRepairTrigger(jokes, verdict([4, 5, 5, 5, 5, 5]), [])).toBe(true);
  });
  it('an unranked candidate is a repair trigger', () => {
    const assessment = verdict([8, 8, 8, 8, 8, 8]); assessment.rankings.pop();
    expect(hasRepairTrigger(jokes, assessment, [])).toBe(true);
  });
});
