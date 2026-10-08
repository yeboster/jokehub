import { createHash } from 'node:crypto';
import { ALGORITHM_VERSION, DEFAULT_MODEL, DEFAULT_TEMPERATURE, RUBRICS, blindSchema, captureSchema, keySchema, ratingsSchema, requestsSchema, type Blind, type Capture, type Input, type PrivateKey, type Requests } from './types';

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
export const digest = (value: unknown): string => createHash('sha256').update(canonical(value)).digest('hex');
export const effectiveInput = (input: Input, model = DEFAULT_MODEL as Capture['model'], temperature = DEFAULT_TEMPERATURE): Input => ({ ...input, model: input.model ?? model, temperature: input.temperature ?? temperature });
function requireCondition(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
export function validateCapture(requests: Requests, raw: unknown): Capture {
  const c = captureSchema.parse(raw);
  requireCondition(c.fixtureHash === digest(requests), 'Fixture hash mismatch');
  requireCondition(c.records.length === requests.cases.length, 'Capture coverage mismatch');
  const records = new Map(c.records.map(r => [r.caseId, r]));
  requireCondition(records.size === c.records.length, 'Duplicate capture record');
  for (const item of requests.cases) {
    const r = records.get(item.caseId);
    requireCondition(r, 'Missing capture record');
    const input = effectiveInput(item.input, c.model, c.temperature);
    requireCondition(input.model === c.model && input.temperature === c.temperature, 'Effective settings mismatch');
    requireCondition(r.inputHash === digest(input), 'Input hash mismatch');
  }
  return c;
}
const oldHasLabelA = (tuple: readonly string[], caseId: string): boolean => parseInt(digest([...tuple, caseId, 'labels']).slice(0, 2), 16) % 2 === 0;
const provenance = (c: Capture) => ({ variantId: c.variantId, captureHash: digest(c), sourceCommit: c.sourceCommit, captureKind: c.captureKind, adapterVersion: c.adapterVersion });
export function prepare(rawRequests: unknown, rawOld: unknown, rawNew: unknown, seed: string): { blind: Blind; key: PrivateKey } {
  const requests = requestsSchema.parse(rawRequests);
  requireCondition(typeof seed === 'string' && seed.length > 0 && seed.length <= 200, 'Invalid seed');
  const old = validateCapture(requests, rawOld), next = validateCapture(requests, rawNew);
  requireCondition(old.variantId !== next.variantId, 'Variants must differ');
  requireCondition(old.model === next.model && old.temperature === next.temperature, 'Matched settings required');
  const fixtureHash = digest(requests), oldHash = digest(old), newHash = digest(next);
  const tuple = [ALGORITHM_VERSION, seed, fixtureHash, oldHash, newHash];
  const packetId = digest(tuple);
  const ordered = [...requests.cases].sort((a, b) => {
    const ah = digest([...tuple, a.caseId, 'order']), bh = digest([...tuple, b.caseId, 'order']);
    return ah < bh ? -1 : ah > bh ? 1 : a.caseId < b.caseId ? -1 : a.caseId > b.caseId ? 1 : 0;
  });
  const mapping: PrivateKey['cases'] = [];
  const cases: Blind['cases'] = ordered.map(item => {
    const oldA = oldHasLabelA(tuple, item.caseId);
    const a = oldA ? old : next, b = oldA ? next : old;
    const ar = a.records.find(r => r.caseId === item.caseId)!, br = b.records.find(r => r.caseId === item.caseId)!;
    mapping.push({ caseId: item.caseId, A: { variantId: a.variantId, status: ar.status }, B: { variantId: b.variantId, status: br.status } });
    return { caseId: item.caseId, dimensions: item.dimensions, request: item.input,
      A: ar.status === 'success' ? { status: 'success', jokes: ar.output.jokes } : { status: 'unavailable' },
      B: br.status === 'success' ? { status: 'success', jokes: br.output.jokes } : { status: 'unavailable' } };
  });
  const blind = blindSchema.parse({ schemaVersion: 1, packetId, cases });
  const key = keySchema.parse({ schemaVersion: 1, packetId, algorithmVersion: ALGORITHM_VERSION, seed, fixtureHash, old: provenance(old), new: provenance(next), blindHash: digest(blind), cases: mapping });
  return { blind, key };
}
function validatePacket(blind: Blind, key: PrivateKey): void {
  requireCondition(blind.packetId === key.packetId && digest(blind) === key.blindHash, 'Blind packet integrity mismatch');
  const tuple = [key.algorithmVersion, key.seed, key.fixtureHash, key.old.captureHash, key.new.captureHash];
  requireCondition(digest(tuple) === key.packetId, 'Packet identity mismatch');
  requireCondition(key.old.variantId !== key.new.variantId, 'Distinct variants required');
  requireCondition(key.cases.length === blind.cases.length && new Set(key.cases.map(c => c.caseId)).size === key.cases.length && new Set(blind.cases.map(c => c.caseId)).size === blind.cases.length, 'Mapping coverage mismatch');
  for (const c of blind.cases) {
    const m = key.cases.find(k => k.caseId === c.caseId);
    requireCondition(m, 'Missing mapping');
    requireCondition(new Set([m.A.variantId, m.B.variantId]).size === 2 && [m.A.variantId, m.B.variantId].every(v => v === key.old.variantId || v === key.new.variantId), 'Invalid variant mapping');
    const oldA = oldHasLabelA(tuple, c.caseId);
    requireCondition(m.A.variantId === (oldA ? key.old.variantId : key.new.variantId) && m.B.variantId === (oldA ? key.new.variantId : key.old.variantId), 'Deterministic label mapping mismatch');
    for (const label of ['A', 'B'] as const) requireCondition((c[label].status === 'success') === (m[label].status === 'success'), 'Slot status mismatch');
  }
}
function validateFrozenCaptures(blind: Blind, key: PrivateKey, old: Capture, next: Capture): void {
  requireCondition(canonical(provenance(old)) === canonical(key.old) && canonical(provenance(next)) === canonical(key.new), 'Telemetry capture provenance mismatch');
  requireCondition(old.fixtureHash === key.fixtureHash && next.fixtureHash === key.fixtureHash && old.model === next.model && old.temperature === next.temperature, 'Frozen capture settings mismatch');
  for (const capture of [old, next]) {
    const records = new Map(capture.records.map(r => [r.caseId, r]));
    requireCondition(capture.records.length === blind.cases.length && records.size === blind.cases.length && blind.cases.every(c => records.has(c.caseId)), 'Frozen capture coverage mismatch');
    for (const c of blind.cases) {
      const mapping = key.cases.find(m => m.caseId === c.caseId)!;
      const label = mapping.A.variantId === capture.variantId ? 'A' : 'B';
      const record = records.get(c.caseId)!;
      const expectedSlot = record.status === 'success' ? { status: 'success', jokes: record.output.jokes } : { status: 'unavailable' };
      requireCondition(mapping[label].status === record.status && canonical(c[label]) === canonical(expectedSlot), 'Frozen capture slot mismatch');
      requireCondition(record.inputHash === digest(effectiveInput(c.request, capture.model, capture.temperature)), 'Frozen capture input mismatch');
    }
  }
}
const mean = (values: number[]): number | null => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const fields = ['modelCalls', 'inputTokens', 'outputTokens', 'totalTokens', 'latencyMs'] as const;
function telemetrySummary(capture: Capture) {
  return Object.fromEntries(fields.map(f => {
    const values = capture.records.map(r => r.telemetry[f]).filter((n): n is number => n !== null);
    return [f, { knownTotal: values.length ? values.reduce((a, b) => a + b, 0) : null, measured: values.length, unknown: capture.records.length - values.length }];
  }));
}
export function summarize(rawBlind: unknown, rawKey: unknown, rawRatings: unknown, rawOld?: unknown, rawNew?: unknown) {
  const blind = blindSchema.parse(rawBlind), key = keySchema.parse(rawKey), ratings = ratingsSchema.parse(rawRatings);
  validatePacket(blind, key);
  requireCondition((rawOld === undefined) === (rawNew === undefined), 'Both captures required for telemetry');
  const old = rawOld === undefined ? undefined : captureSchema.parse(rawOld);
  const next = rawNew === undefined ? undefined : captureSchema.parse(rawNew);
  if (old && next) validateFrozenCaptures(blind, key, old, next);
  requireCondition(ratings.packetId === blind.packetId, 'Ratings packet mismatch');
  const seen = new Set<string>();
  for (const row of ratings.rows) {
    const c = blind.cases.find(c => c.caseId === row.caseId);
    requireCondition(c, 'Unknown rated case');
    const pair = canonical([row.caseId, row.raterId]);
    requireCondition(!seen.has(pair), 'Duplicate case/rater pair'); seen.add(pair);
    if (c.A.status !== 'success' || c.B.status !== 'success') requireCondition(row.preference === 'unrateable', 'Failure case must be unrateable');
    for (const label of ['A', 'B'] as const) if (c[label].status !== 'success') requireCondition(row[label] === undefined, 'Unavailable slot cannot be scored');
  }
  const reliability = { plannedCases: blind.cases.length, bothSuccess: 0, oldOnlyFailure: 0, newOnlyFailure: 0, bothFailure: 0 };
  const counts = { oldWins: 0, newWins: 0, ties: 0, unrateable: 0, missingCases: 0 };
  const casePreferences: number[] = [];
  const rubricCases: Record<string, number[]> = Object.fromEntries(RUBRICS.map(r => [r, []]));
  const rubricPairs: Record<string, number> = Object.fromEntries(RUBRICS.map(r => [r, 0]));
  const safety = { old: { safe: 0, unsafe: 0, unknown: 0 }, new: { safe: 0, unsafe: 0, unknown: 0 } };
  const caseSummaries = blind.cases.map(c => {
    const m = key.cases.find(k => k.caseId === c.caseId)!;
    const oldLabel = m.A.variantId === key.old.variantId ? 'A' : 'B', newLabel = oldLabel === 'A' ? 'B' : 'A';
    const oldOK = c[oldLabel].status === 'success', newOK = c[newLabel].status === 'success';
    if (oldOK && newOK) reliability.bothSuccess++; else if (!oldOK && !newOK) reliability.bothFailure++; else if (!oldOK) reliability.oldOnlyFailure++; else reliability.newOnlyFailure++;
    const rows = ratings.rows.filter(r => r.caseId === c.caseId);
    const prefs: number[] = [];
    if (oldOK && newOK && !rows.length) counts.missingCases++;
    for (const row of rows) {
      if (oldOK && newOK) {
        if (row.preference === 'tie') { counts.ties++; prefs.push(0); }
        else if (row.preference === 'unrateable') counts.unrateable++;
        else if (row.preference === oldLabel) { counts.oldWins++; prefs.push(-1); }
        else { counts.newWins++; prefs.push(1); }
      }
      for (const [variant, label] of [['old', oldLabel], ['new', newLabel]] as const) {
        if (c[label].status === 'success') {
          const flag = row[label]?.safeForGeneralAudience;
          safety[variant][flag === true ? 'safe' : flag === false ? 'unsafe' : 'unknown']++;
        }
      }
    }
    if (prefs.length) casePreferences.push(mean(prefs)!);
    const rubricDeltas: Record<string, { meanDelta: number | null; matchedPairs: number }> = {};
    for (const rubric of RUBRICS) {
      const deltas = rows.flatMap(row => {
        const a = row[oldLabel]?.[rubric], b = row[newLabel]?.[rubric];
        return typeof a === 'number' && typeof b === 'number' ? [b - a] : [];
      });
      if (deltas.length) rubricCases[rubric].push(mean(deltas)!);
      rubricPairs[rubric] += deltas.length;
      rubricDeltas[rubric] = { meanDelta: mean(deltas), matchedPairs: deltas.length };
    }
    return { caseId: c.caseId, comparable: oldOK && newOK, ratingRows: rows.length, meanPreference: mean(prefs), rubricDeltas };
  });
  const rubrics = Object.fromEntries(RUBRICS.map(r => [r, { meanDelta: mean(rubricCases[r]), ratedCases: rubricCases[r].length, matchedPairs: rubricPairs[r] }]));
  let telemetry: unknown = null;
  if (old && next) {
    const paired = Object.fromEntries(fields.map(f => {
      const deltas: number[] = [];
      for (const a of old.records) {
        const b = next.records.find(r => r.caseId === a.caseId)!;
        const av = a.telemetry[f], bv = b.telemetry[f];
        if (av !== null && bv !== null) deltas.push(bv - av);
      }
      return [f, { meanDelta: mean(deltas), measuredPairs: deltas.length, unknownPairs: blind.cases.length - deltas.length }];
    }));
    telemetry = { old: telemetrySummary(old), new: telemetrySummary(next), paired, monetaryCost: null, definitions: { old: old.telemetryDefinition, new: next.telemetryDefinition } };
  }
  return { schemaVersion: 1, packetId: blind.packetId, provenance: { old: key.old, new: key.new, ratingKind: ratings.ratingKind }, synthetic: ratings.ratingKind === 'synthetic' || key.old.captureKind === 'synthetic' || key.new.captureKind === 'synthetic', reliability,
    quality: { status: ratings.ratingKind === 'human' && ratings.rows.length && ![key.old.captureKind, key.new.captureKind].includes('synthetic') ? 'human-ratings' : 'not-evaluated', counts, rawRatingRows: ratings.rows.length, failureRatingRows: ratings.rows.filter(r => { const c = blind.cases.find(c => c.caseId === r.caseId)!; return c.A.status !== 'success' || c.B.status !== 'success'; }).length, meanPreference: mean(casePreferences), ratedComparableCases: casePreferences.length, rubrics, safety, cases: caseSummaries }, telemetry };
}
