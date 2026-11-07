// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { FeedbackUpsertSchema, SampleCreateSchema, SampleUpdateSchema, emptyTasteProfile, isEmptyTasteProfile } from './tasteProfile';

describe('tasteProfile contract', () => {
  it('distinguishes an unchanged vote (undefined) from a cleared vote (null)', () => {
    expect(FeedbackUpsertSchema.parse({ jokeText: 'A joke' }).vote).toBeUndefined();
    expect(FeedbackUpsertSchema.parse({ jokeText: 'A joke', vote: null }).vote).toBeNull();
    expect(FeedbackUpsertSchema.parse({ jokeText: 'A joke', vote: 'none' }).vote).toBeNull();
    expect(FeedbackUpsertSchema.parse({ jokeText: 'A joke', vote: 'down', mode: 'classic' }).mode).toBe('classic');
    expect(FeedbackUpsertSchema.safeParse({ jokeText: 'A joke', vote: 'meh' }).success).toBe(false);
  });

  it.each([
    [{ jokeText: '   ' }],
    [{ jokeText: 'x'.repeat(2001) }],
    [{ jokeText: 'ok', reason: 'r'.repeat(201) }],
    [{ jokeText: 'ok', topicHint: 't'.repeat(501) }],
  ])('rejects out-of-bounds feedback %#', input => {
    expect(FeedbackUpsertSchema.safeParse(input).success).toBe(false);
  });

  it('validates samples and sample ids', () => {
    expect(SampleCreateSchema.safeParse({ text: 'A sample', note: 'love it' }).success).toBe(true);
    expect(SampleCreateSchema.safeParse({ text: '?!' }).success).toBe(false);
    expect(SampleUpdateSchema.safeParse({ id: 'a'.repeat(32), active: false }).success).toBe(true);
    expect(SampleUpdateSchema.safeParse({ id: '../x', active: false }).success).toBe(false);
  });

  it('returns a fresh empty profile each time', () => {
    const a = emptyTasteProfile();
    a.samples.push('x');
    expect(emptyTasteProfile().samples).toEqual([]);
    expect(isEmptyTasteProfile(emptyTasteProfile())).toBe(true);
    expect(isEmptyTasteProfile({ samples: [], liked: [{ text: 'x' }], disliked: [] })).toBe(false);
  });
});
