// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { canonical, digest, prepare, summarize } from './core';
import { DEFAULT_MODEL, UNKNOWN_TELEMETRY, type Blind, type Capture, type PrivateKey, type Ratings, type Requests } from './types';

function sample(size = 8) {
  const requests: Requests = { schemaVersion: 1, cases: Array.from({ length: size }, (_, i) => ({ caseId: `c${i}`, dimensions: ['test'], input: {} })) };
  const capture = (variantId: string): Capture => ({ schemaVersion: 1, variantId, sourceCommit: null, fixtureHash: digest(requests), model: DEFAULT_MODEL, temperature: 1.1, captureKind: 'synthetic', adapterVersion: 'test-v1', telemetryDefinition: { tokenSource: null, latencySource: null }, records: requests.cases.map(c => ({ caseId: c.caseId, inputHash: digest({ model: DEFAULT_MODEL, temperature: 1.1 }), status: 'success', output: { jokes: [1, 2, 3].map(n => ({ jokeText: `${variantId} joke ${n}`, category: 'test' })) }, telemetry: { ...UNKNOWN_TELEMETRY } })) });
  return { requests, old: capture('old'), new: capture('new') };
}
const packet = (s = sample()) => prepare(s.requests, s.old, s.new, 'seed') as { blind: Blind; key: PrivateKey };
const ratings = (b: Blind): Ratings => ({ schemaVersion: 1, packetId: b.packetId, ratingKind: 'human', rows: [] });

describe('frozen comparisons', () => {
  it('canonicalizes recursively without changing array order', () => {
    expect(canonical({ z: [{ b: 2, a: 1 }], a: 0 })).toBe('{"a":0,"z":[{"a":1,"b":2}]}');
  });
  it('creates deterministic blind bytes and both label orientations with no metadata leakage', () => {
    const s = sample(40), p = packet(s);
    expect(p.blind.cases).toHaveLength(40);
    expect(canonical(p)).toBe(canonical(packet(s)));
    expect(new Set(p.key.cases.map(c => c.A.variantId))).toEqual(new Set(['old', 'new']));
    expect(Object.keys(p.blind).sort()).toEqual(['cases', 'packetId', 'schemaVersion']);
    expect(JSON.stringify(p.blind)).not.toMatch(/sourceCommit|captureHash|telemetry|variantId|seed|adapterVersion/);
    expect(new Set(p.blind.cases.map(c => c.caseId)).size).toBe(40);
    expect(p.blind.cases.map(c => c.caseId)).not.toEqual(s.requests.cases.map(c => c.caseId));
    expect(prepare(s.requests, s.old, s.new, 'other')).not.toEqual(p);
  });
  it('rejects mismatched captures, invalid fixtures, output and unknown fields', () => {
    for (const change of [
      (s: ReturnType<typeof sample>) => { s.new.fixtureHash = '0'.repeat(64); },
      (s: ReturnType<typeof sample>) => { s.new.temperature = 0; },
      (s: ReturnType<typeof sample>) => { s.new.variantId = 'old'; },
      (s: ReturnType<typeof sample>) => { s.new.records.pop(); },
      (s: ReturnType<typeof sample>) => { s.new.records.push(s.new.records[0]); },
      (s: ReturnType<typeof sample>) => { s.new.records[0].inputHash = '0'.repeat(64); },
      (s: ReturnType<typeof sample>) => { if (s.new.records[0].status === 'success') s.new.records[0].output.jokes.pop(); },
      (s: ReturnType<typeof sample>) => { s.new.captureKind = 'live'; },
      (s: ReturnType<typeof sample>) => { s.requests.cases[0].regenerationOf = 'c0'; },
      (s: ReturnType<typeof sample>) => { s.requests.cases[0].input.topicHint = 'x'.repeat(501); },
    ]) { const s = sample(); change(s); expect(() => packet(s)).toThrow(); }
    const s = sample(); expect(() => prepare({ ...s.requests, hidden: true }, s.old, s.new, 'seed')).toThrow();
  });
  it('integrity rejects tampering and foreign/duplicate ratings', () => {
    const p = packet(); const r = ratings(p.blind);
    expect(() => summarize({ ...p.blind, packetId: '0'.repeat(64) }, p.key, r)).toThrow();
    const tampered = structuredClone(p.blind); tampered.cases[0].request.topicHint = 'changed';
    expect(() => summarize(tampered, p.key, r)).toThrow();
    expect(() => summarize(p.blind, p.key, { ...r, packetId: '0'.repeat(64) })).toThrow();
    const row = { caseId: 'c0', raterId: 'r1', preference: 'tie' } as const;
    expect(() => summarize(p.blind, p.key, { ...r, rows: [row, row] })).toThrow();
    expect(() => summarize(p.blind, p.key, { ...r, rows: [{ ...row, caseId: 'foreign' }] })).toThrow();
    expect(() => summarize(p.blind, p.key, { ...r, rows: [{ ...row, A: { clarity: 6 } }] })).toThrow();
    const forgedProvenance = structuredClone(p.key); forgedProvenance.old.adapterVersion = 'forged';
    const s = sample();
    expect(() => summarize(p.blind, forgedProvenance, r, s.old, s.new)).toThrow();
    const badKey = structuredClone(p.key); badKey.cases[0].A.variantId = 'foreign';
    expect(() => summarize(p.blind, badKey, r)).toThrow();
  });
  it.each([false, true])('rejects key-only label swap before aggregation (captures=%s)', withCaptures => {
    const s = sample(), p = packet(s), swapped = structuredClone(p.key);
    [swapped.cases[0].A, swapped.cases[0].B] = [swapped.cases[0].B, swapped.cases[0].A];
    expect(() => summarize(p.blind, swapped, ratings(p.blind), ...(withCaptures ? [s.old, s.new] : []))).toThrow('Deterministic label mapping mismatch');
  });
  it.each(['output', 'status', 'missing', 'duplicate', 'extra'] as const)('rejects frozen capture slot/coverage mismatch: %s', change => {
    const s = sample(), p = packet(s), blind = structuredClone(p.blind), key = structuredClone(p.key);
    const c = blind.cases[0], mapping = key.cases.find(m => m.caseId === c.caseId)!;
    if (change === 'output' && c.A.status === 'success') c.A.jokes[0].jokeText = 'Different output';
    if (change === 'status') { c.A = { status: 'unavailable' }; mapping.A.status = 'failure'; }
    if (change === 'missing') { blind.cases.pop(); key.cases.pop(); }
    if (change === 'duplicate' || change === 'extra') {
      const record = structuredClone(s.old.records[0]);
      if (change === 'extra') record.caseId = 'unplanned';
      s.old.records.push(record);
      key.old.captureHash = digest(s.old);
      key.packetId = digest([key.algorithmVersion, key.seed, key.fixtureHash, key.old.captureHash, key.new.captureHash]);
      blind.packetId = key.packetId;
      for (const m of key.cases) {
        const oldA = parseInt(digest([key.algorithmVersion, key.seed, key.fixtureHash, key.old.captureHash, key.new.captureHash, m.caseId, 'labels']).slice(0, 2), 16) % 2 === 0;
        m.A.variantId = oldA ? 'old' : 'new'; m.B.variantId = oldA ? 'new' : 'old';
      }
    }
    key.blindHash = digest(blind);
    expect(() => summarize(blind, key, ratings(blind), s.old, s.new)).toThrow(/Frozen capture (slot|coverage) mismatch/);
  });
  it('weights cases equally, retains ties/missing/unrateable and legitimate seed label invariance', () => {
    const s = sample(4), p = packet(s), r = ratings(p.blind);
    for (let i = 0; i < 3; i++) r.rows.push({ caseId: 'c0', raterId: `r${i}`, preference: p.key.cases.find(c => c.caseId === 'c0')!.A.variantId === 'new' ? 'A' : 'B', A: { clarity: 3 }, B: { clarity: 3 } });
    r.rows.push({ caseId: 'c1', raterId: 'r0', preference: p.key.cases.find(c => c.caseId === 'c1')!.A.variantId === 'old' ? 'A' : 'B' });
    r.rows.push({ caseId: 'c2', raterId: 'r0', preference: 'tie' });
    r.rows.push({ caseId: 'c2', raterId: 'r1', preference: 'unrateable' });
    const summary = summarize(p.blind, p.key, r) as { quality: { meanPreference: number; counts: Record<string, number>; ratedComparableCases: number } };
    expect(summary.quality.meanPreference).toBe(0);
    expect(summary.quality.ratedComparableCases).toBe(3);
    expect(summary.quality.counts).toEqual({ oldWins: 1, newWins: 3, ties: 1, unrateable: 1, missingCases: 1 });
    const other = prepare(s.requests, s.old, s.new, 'other-seed'), mirrored = structuredClone(r);
    mirrored.packetId = other.blind.packetId;
    let changedLabels = 0;
    mirrored.rows.forEach(row => {
      const before = p.key.cases.find(c => c.caseId === row.caseId)!;
      const after = other.key.cases.find(c => c.caseId === row.caseId)!;
      if (before.A.variantId !== after.A.variantId) {
        changedLabels++;
        row.preference = row.preference === 'A' ? 'B' : row.preference === 'B' ? 'A' : row.preference;
        [row.A, row.B] = [row.B, row.A]; if (!row.A) delete row.A; if (!row.B) delete row.B;
      }
    });
    expect(changedLabels).toBeGreaterThan(0);
    expect(other.blind.packetId).not.toBe(p.blind.packetId);
    const otherSummary = summarize(other.blind, other.key, mirrored);
    expect(otherSummary.quality.counts).toEqual(summary.quality.counts);
    expect(otherSummary.quality.meanPreference).toBe(summary.quality.meanPreference);
    expect(otherSummary.quality.ratedComparableCases).toBe(summary.quality.ratedComparableCases);
    expect(otherSummary.quality.rubrics).toEqual(summarize(p.blind, p.key, r).quality.rubrics);
  });
  it('rubric deltas use matched pairs and equal case weights; safety stays separate', () => {
    const s = sample(3); s.old.captureKind = 'mock'; s.new.captureKind = 'mock';
    const p = packet(s), r = ratings(p.blind);
    for (const [caseId, raters, oldScore, newScore] of [['c0', 3, 1, 5], ['c1', 1, 5, 1]] as const) {
      const m = p.key.cases.find(c => c.caseId === caseId)!;
      const oldLabel = m.A.variantId === 'old' ? 'A' : 'B', newLabel = oldLabel === 'A' ? 'B' : 'A';
      for (let i = 0; i < raters; i++) r.rows.push({ caseId, raterId: `r${i}`, preference: 'tie', [oldLabel]: { clarity: oldScore, safeForGeneralAudience: true }, [newLabel]: { clarity: newScore, safeForGeneralAudience: false } });
    }
    r.rows.push({ caseId: 'c2', raterId: 'r0', preference: 'unrateable', A: { clarity: 5 } });
    const result = summarize(p.blind, p.key, r);
    expect(result.quality.status).toBe('human-ratings');
    expect(result.quality.rubrics.clarity).toEqual({ meanDelta: 0, ratedCases: 2, matchedPairs: 4 });
    expect(result.quality.rubrics.originality).toEqual({ meanDelta: null, ratedCases: 0, matchedPairs: 0 });
    expect(result.quality.safety.new.unsafe).toBe(4);
    expect(result.quality.safety.old.safe).toBe(4);
    expect(result.quality.ratedComparableCases).toBe(2);
  });
  it('telemetry reports paired coverage, null monetary cost and never invents unknown totals', () => {
    const s = sample(3);
    for (const c of [s.old, s.new]) c.telemetryDefinition = { tokenSource: 'mock measured tokens', latencySource: 'mock elapsed milliseconds' };
    s.old.records[0].telemetry = { modelCalls: 2, inputTokens: 0, outputTokens: 10, totalTokens: 10, latencyMs: 0 };
    s.new.records[0].telemetry = { modelCalls: 4, inputTokens: 5, outputTokens: 15, totalTokens: 20, latencyMs: 8 };
    const p = packet(s), result = summarize(p.blind, p.key, ratings(p.blind), s.old, s.new) as unknown as { telemetry: { paired: Record<string, unknown>; old: Record<string, unknown>; monetaryCost: null } };
    expect(result.telemetry.paired.totalTokens).toEqual({ meanDelta: 10, measuredPairs: 1, unknownPairs: 2 });
    expect(result.telemetry.old.totalTokens).toEqual({ knownTotal: 10, measured: 1, unknown: 2 });
    expect(result.telemetry.monetaryCost).toBeNull();
    const empty = packet(); const noMeasurements = summarize(empty.blind, empty.key, ratings(empty.blind), sample().old, sample().new) as unknown as { telemetry: { old: Record<string, unknown> } };
    expect(noMeasurements.telemetry.old.totalTokens).toEqual({ knownTotal: null, measured: 0, unknown: 8 });
    s.old.records[0].telemetry.inputTokens = -1;
    expect(() => packet(s)).toThrow();
  });
  it('schema boundaries enforce context caps, integer counts and strict rating/provenance shapes', () => {
    for (const input of [{ prefilledJokes: Array(26).fill('text') }, { exemplarJokes: Array(11).fill('text') }, { recentGeneratedJokes: Array(13).fill('text') }, { exemplarJokes: ['!!!'] }, { topicHint: 'x'.repeat(501) }, { temperature: Number.NaN }, { model: 'unsupported' }]) {
      const s = sample(); s.requests.cases[0].input = input as never; expect(() => packet(s)).toThrow();
    }
    const s = sample(); s.new.sourceCommit = 'not-a-revision'; expect(() => packet(s)).toThrow();
    const p = packet();
    expect(() => summarize(p.blind, p.key, { ...ratings(p.blind), rows: [{ caseId: 'c0', raterId: 'x', preference: 'tie', unknown: true }] })).toThrow();
    expect(() => summarize(p.blind, p.key, { ...ratings(p.blind), rows: [{ caseId: 'c0', raterId: '', preference: 'tie' }] })).toThrow();
  });
  it('retains whole failures and unknown telemetry, genuine zero, failure measurements', () => {
    const s = sample(4);
    s.old.records[1] = { ...s.old.records[1], status: 'failure', errorCode: 'FAILED', output: undefined } as never;
    delete (s.old.records[1] as unknown as Record<string, unknown>).output;
    s.new.records[2] = { caseId: 'c2', inputHash: s.new.records[2].inputHash, status: 'failure', errorCode: 'FAILED', telemetry: { ...UNKNOWN_TELEMETRY, modelCalls: 2 } };
    s.old.records[3] = { caseId: 'c3', inputHash: s.old.records[3].inputHash, status: 'failure', errorCode: 'FAILED', telemetry: { ...UNKNOWN_TELEMETRY } };
    s.new.records[3] = { ...s.old.records[3] };
    s.old.records[0].telemetry.modelCalls = 0;
    const p = packet(s), r = ratings(p.blind);
    const result = summarize(p.blind, p.key, r, s.old, s.new) as { reliability: unknown; telemetry: { old: { modelCalls: unknown }; new: { modelCalls: unknown } }; quality: { status: string } };
    expect(result.reliability).toEqual({ plannedCases: 4, bothSuccess: 1, oldOnlyFailure: 1, newOnlyFailure: 1, bothFailure: 1 });
    expect(result.telemetry.old.modelCalls).toEqual({ knownTotal: 0, measured: 1, unknown: 3 });
    expect(result.telemetry.new.modelCalls).toEqual({ knownTotal: 2, measured: 1, unknown: 3 });
    expect(result.quality.status).toBe('not-evaluated');
    expect(() => summarize(p.blind, p.key, { ...r, rows: [{ caseId: 'c1', raterId: 'r', preference: 'tie' }] })).toThrow();
    expect(() => summarize(p.blind, p.key, { ...r, rows: [{ caseId: 'c1', raterId: 'r', preference: 'unrateable', [p.key.cases.find(c => c.caseId === 'c1')!.A.variantId === 'old' ? 'A' : 'B']: { clarity: 1 } }] })).toThrow();
  });
});
