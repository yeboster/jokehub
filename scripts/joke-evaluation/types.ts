import { z } from 'zod';

// Frozen v1 catalog. Deliberately local: offline tooling never imports application runtime.
export const MODELS = ['googleai/gemini-3.7-flash', 'googleai/gemini-3.6-flash', 'googleai/gemini-3.5-flash', 'googleai/gemini-3.5-flash-lite', 'googleai/gemini-3.1-flash-lite', 'googleai/gemini-2.5-flash'] as const;
export const DEFAULT_MODEL = 'googleai/gemini-3.6-flash';
export const DEFAULT_TEMPERATURE = 1.1;
export const ALGORITHM_VERSION = 'sha256-blind-v1';
const version = z.literal(1);
const id = z.string().trim().min(1).max(120);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const revision = z.string().regex(/^[a-f0-9]{40}$/);
const key = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}\p{M}\s]/gu, '').replace(/\s+/gu, ' ').trim();
const text = z.string().max(2000).refine(s => key(s).length > 0, 'Empty normalized text');
const temperature = z.number().finite().min(0).max(2);
export const inputSchema = z.object({
  topicHint: z.string().max(500).optional(),
  prefilledJokes: z.array(text).max(25).optional(),
  exemplarJokes: z.array(text).max(10).optional(),
  recentGeneratedJokes: z.array(text).max(12).optional(),
  model: z.enum(MODELS).optional(),
  temperature: temperature.optional(),
}).strict();
export const requestsSchema = z.object({
  schemaVersion: version,
  cases: z.array(z.object({ caseId: id, dimensions: z.array(id).min(1), input: inputSchema, regenerationOf: id.optional() }).strict()).min(1),
}).strict().superRefine((value, ctx) => {
  const seen = new Set<string>();
  value.cases.forEach((c, i) => {
    if (seen.has(c.caseId)) ctx.addIssue({ code: 'custom', path: ['cases', i], message: 'Duplicate case' });
    if (c.regenerationOf && !seen.has(c.regenerationOf)) ctx.addIssue({ code: 'custom', path: ['cases', i], message: 'Regeneration must reference earlier case' });
    seen.add(c.caseId);
  });
});
export const outputSchema = z.object({ jokes: z.array(z.object({ jokeText: text, category: z.string().trim().min(1).max(2000) }).strict()).length(3) }).strict();
const count = z.number().int().nonnegative().nullable();
export const telemetrySchema = z.object({
  modelCalls: count, inputTokens: count, outputTokens: count, totalTokens: count,
  latencyMs: z.number().finite().nonnegative().nullable(),
}).strict();
export const UNKNOWN_TELEMETRY = { modelCalls: null, inputTokens: null, outputTokens: null, totalTokens: null, latencyMs: null };
const recordBase = { caseId: id, inputHash: hash, telemetry: telemetrySchema };
export const recordSchema = z.discriminatedUnion('status', [
  z.object({ ...recordBase, status: z.literal('success'), output: outputSchema }).strict(),
  z.object({ ...recordBase, status: z.literal('failure'), errorCode: z.string().regex(/^[A-Z0-9_]{1,80}$/) }).strict(),
]);
export const captureSchema = z.object({
  schemaVersion: version, variantId: id, sourceCommit: revision.nullable(), fixtureHash: hash,
  model: z.enum(MODELS), temperature, captureKind: z.enum(['synthetic', 'mock', 'live']), adapterVersion: id,
  telemetryDefinition: z.object({ tokenSource: id.nullable(), latencySource: id.nullable() }).strict(),
  records: z.array(recordSchema),
}).strict().superRefine((v, ctx) => {
  if (v.captureKind === 'live' && !v.sourceCommit) ctx.addIssue({ code: 'custom', message: 'Live capture requires full revision' });
  for (const r of v.records) {
    if (!v.telemetryDefinition.tokenSource && [r.telemetry.inputTokens, r.telemetry.outputTokens, r.telemetry.totalTokens].some(n => n !== null)) ctx.addIssue({ code: 'custom', message: 'Measured tokens require definition' });
    if (!v.telemetryDefinition.latencySource && r.telemetry.latencyMs !== null) ctx.addIssue({ code: 'custom', message: 'Measured latency requires definition' });
  }
});
const slotSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('success'), jokes: outputSchema.shape.jokes }).strict(),
  z.object({ status: z.literal('unavailable') }).strict(),
]);
export const blindSchema = z.object({ schemaVersion: version, packetId: hash, cases: z.array(z.object({
  caseId: id, dimensions: z.array(id), request: inputSchema, A: slotSchema, B: slotSchema,
}).strict()).min(1) }).strict();
const provenanceSchema = z.object({ variantId: id, captureHash: hash, sourceCommit: revision.nullable(), captureKind: z.enum(['synthetic', 'mock', 'live']), adapterVersion: id }).strict();
export const keySchema = z.object({
  schemaVersion: version, packetId: hash, algorithmVersion: z.literal(ALGORITHM_VERSION), seed: z.string().min(1).max(200), fixtureHash: hash,
  old: provenanceSchema, new: provenanceSchema, blindHash: hash,
  cases: z.array(z.object({ caseId: id,
    A: z.object({ variantId: id, status: z.enum(['success', 'failure']) }).strict(),
    B: z.object({ variantId: id, status: z.enum(['success', 'failure']) }).strict(),
  }).strict()),
}).strict();
export const RUBRICS = ['requestFit', 'clarity', 'earnedSurprise', 'naturalWording', 'originality', 'diversity'] as const;
const score = z.number().int().min(1).max(5).optional();
const rubricSchema = z.object({ requestFit: score, clarity: score, earnedSurprise: score, naturalWording: score, originality: score, diversity: score, safeForGeneralAudience: z.boolean().nullable().optional() }).strict();
export const ratingsSchema = z.object({ schemaVersion: version, packetId: hash, ratingKind: z.enum(['human', 'synthetic']), rows: z.array(z.object({
  caseId: id, raterId: id, preference: z.enum(['A', 'B', 'tie', 'unrateable']), A: rubricSchema.optional(), B: rubricSchema.optional(), reason: z.string().max(2000).optional(),
}).strict()) }).strict();
export type Requests = z.infer<typeof requestsSchema>;
export type Input = z.infer<typeof inputSchema>;
export type Output = z.infer<typeof outputSchema>;
export type Capture = z.infer<typeof captureSchema>;
export type CaptureRecord = z.infer<typeof recordSchema>;
export type Telemetry = z.infer<typeof telemetrySchema>;
export type Blind = z.infer<typeof blindSchema>;
export type PrivateKey = z.infer<typeof keySchema>;
export type Ratings = z.infer<typeof ratingsSchema>;
