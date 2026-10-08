// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { compareSelections, CriticOutputSchema, hasRepairTrigger, repairFeedback, selectJokes, type CriticOutput, type JokeSelection } from './joke-selection';

const jokes = Array.from({ length: 6 }, (_, index) => ({ jokeText: `Joke ${index}`, category: 'Test' }));
function verdict(scores = [8, 8, 8, 8, 8, 8], premises = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'], mechanisms = ['m0', 'm1', 'm2', 'm3', 'm4', 'm5']): CriticOutput {
  return { rankings: scores.map((score, index) => ({ index, score, reason: 'Actionable feedback', safeForGeneralAudience: true, fitsRequest: true, original: true, premiseKey: premises[index], mechanismKey: mechanisms[index] })) };
}
const selection = (fields: Partial<JokeSelection> = {}): JokeSelection => ({ jokes: jokes.slice(0, 3), objective: 20, scoreSum: 23, premiseCount: 2, mechanismCount: 2, indices: [0, 2, 3], ...fields });

describe('joke-selection penalized triple search', () => {
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
  it.each(['shape', 'empty', 'reference', 'gates', 'duplicates'] as const)('returns null with fewer than three eligible unique jokes: %s', (kind) => {
    const texts = jokes.map(c => ({ ...c })); const assessment = verdict();
    let references: string[] = [];
    if (kind === 'shape') texts.slice(2).forEach(c => { c.category = ' '; });
    if (kind === 'empty') texts.slice(2).forEach(c => { c.jokeText = '!!!'; });
    if (kind === 'reference') references = texts.slice(2).map(c => c.jokeText.toUpperCase() + '!');
    if (kind === 'gates') assessment.rankings.slice(2).forEach(r => { r.original = false; });
    if (kind === 'duplicates') texts.forEach(c => { c.jokeText = 'same'; });
    expect(selectJokes(texts, assessment, references)).toBeNull();
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
});

describe('critic schema and bounded feedback', () => {
  it('requires full permutation regardless of verdict order', () => {
    const assessment = verdict(); assessment.rankings.reverse();
    expect(CriticOutputSchema.safeParse(assessment).success).toBe(true);
    assessment.rankings[0].index = assessment.rankings[1].index;
    expect(CriticOutputSchema.safeParse(assessment).success).toBe(false);
  });
  it('trims reasons/descriptors, accepts exact bounds and rejects empty normalized descriptors', () => {
    const assessment = verdict(); Object.assign(assessment.rankings[0], { reason: 'x'.repeat(500), premiseKey: 'y'.repeat(80), mechanismKey: '  m  ' });
    const parsed = CriticOutputSchema.parse(assessment);
    expect(parsed.rankings[0].mechanismKey).toBe('m');
    assessment.rankings[0].premiseKey = '!!!';
    expect(CriticOutputSchema.safeParse(assessment).success).toBe(false);
  });
  it('feedback includes exactly six fixed bounded entries in index order with deterministic duplication annotations', () => {
    const texts = jokes.map(c => ({ ...c })); texts[1].jokeText = 'JOKE 0!';
    const assessment = verdict(); assessment.rankings.reverse();
    const feedback = repairFeedback(texts, assessment, ['joke 0']);
    expect(feedback).toHaveLength(6);
    expect(feedback.map(r => r.index)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(feedback[0].duplicateFailure).toBe('candidate-and-reference');
    expect(feedback[1].duplicateFailure).toBe('candidate-and-reference');
    expect(feedback[2].duplicateFailure).toBe('none');
    expect(Object.keys(feedback[0]).sort()).toEqual(['index', 'score', 'reason', 'safeForGeneralAudience', 'fitsRequest', 'original', 'premiseKey', 'mechanismKey', 'jokeText', 'duplicateFailure'].sort());
  });
  it('no repair trigger from homogeneous descriptors alone or score above4', () => {
    expect(hasRepairTrigger(jokes, verdict([4.1, 5, 5, 5, 5, 5], Array(6).fill('same'), Array(6).fill('same')), [])).toBe(false);
    expect(hasRepairTrigger(jokes, verdict([4, 5, 5, 5, 5, 5]), [])).toBe(true);
  });
});
