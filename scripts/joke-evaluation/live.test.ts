// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { captureLive, type Adapter, type LiveOptions } from './live';
import { prepare, summarize } from './core';
import { DEFAULT_MODEL, UNKNOWN_TELEMETRY, type Requests } from './types';
const requests: Requests = { schemaVersion: 1, cases: [{ caseId: 'one', dimensions: ['test'], input: {} }, { caseId: 'two', dimensions: ['test'], input: {} }] };
const options: LiveOptions = { allowLive: true, maxModelCalls: 12, maxCases: 2, adapterPath: '/trusted/mock.ts', old: { revision: 'a'.repeat(40), maxModelCalls: 2 }, new: { revision: 'b'.repeat(40), maxModelCalls: 4 } };
const output = { jokes: [1, 2, 3].map(n => ({ jokeText: `joke ${n}`, category: 'test' })) };
function adapter(): Adapter {
  return { adapterVersion: 'mock-v1', captureKind: 'mock', telemetryDefinition: { tokenSource: null, latencySource: null }, plan: { old: options.old, new: options.new }, invokeModel: vi.fn().mockResolvedValue({}), run: async c => { await c.invokeModel({}); return { output }; } };
}
it('rejects missing opt-in, incomplete allocation, invalid caps/revisions before adapter import', async () => {
  const loadValid = vi.fn(async () => adapter());
  await expect(captureLive(requests, { ...options, allowLive: false }, loadValid)).rejects.toThrow();
  expect(loadValid).not.toHaveBeenCalled();
  for (const bad of [{ allowLive: false }, { maxModelCalls: 11 }, { maxCases: 1 }, { maxCases: 0 }, { maxModelCalls: 1.5 }, { adapterPath: '' }, { old: { ...options.old, revision: 'branch' } }, { new: { ...options.new, maxModelCalls: 5 } }]) {
    const load = vi.fn(); await expect(captureLive(requests, { ...options, ...bad } as LiveOptions, load)).rejects.toThrow(); expect(load).not.toHaveBeenCalled();
  }
});
it('matched sequential inputs, valid success, unknown tokens/latency and measured invocation counts', async () => {
  const a = adapter(), received: unknown[] = [];
  a.run = async c => { received.push(c.input); await c.invokeModel({}); return { output }; };
  const result = await captureLive(requests, options, async () => a);
  expect(received).toEqual(Array(4).fill({ model: DEFAULT_MODEL, temperature: 1.1 }));
  expect(result.old.records[0].status).toBe('success');
  expect(result.new.records[0].telemetry).toEqual({ modelCalls: 1, inputTokens: null, outputTokens: null, totalTokens: null, latencyMs: null });
});
it('failed invocation consumes budget before await; exhaustion stops even swallowed rejection', async () => {
  const a = adapter(); a.invokeModel = vi.fn().mockRejectedValue(new Error('secret transport detail'));
  a.run = async c => { for (let i = 0; i < 8; i++) { try { await c.invokeModel({}); } catch {} } return { output }; };
  const result = await captureLive(requests, options, async () => a);
  expect(a.invokeModel).toHaveBeenCalledTimes(12);
  expect(result.old.records.every(r => r.status === 'failure' && r.errorCode === 'MODEL_BUDGET_EXHAUSTED' && r.telemetry.modelCalls === 2)).toBe(true);
  expect(result.new.records.every(r => r.status === 'failure' && r.telemetry.modelCalls === 4)).toBe(true);
  expect(JSON.stringify(result)).not.toContain('secret');
});
it('rejects adapter plan mismatch before any calls; closes capability after run', async () => {
  const a = adapter(); a.plan = { ...a.plan, new: { ...a.plan.new, maxModelCalls: 2 } };
  await expect(captureLive(requests, options, async () => a)).rejects.toThrow(); expect(a.invokeModel).not.toHaveBeenCalled();
  const b = adapter(); let saved: ((r: unknown) => Promise<unknown>) | undefined;
  b.run = async c => { saved = c.invokeModel; return { output }; };
  await captureLive(requests, options, async () => b);
  await expect(saved!({})).rejects.toThrow('closed'); expect(b.invokeModel).not.toHaveBeenCalled();
});
it('invalid output and adapter rejection retained as bounded sanitized failures', async () => {
  const a = adapter(); a.run = async c => { await c.invokeModel({}); throw new Error('private error'); };
  const result = await captureLive(requests, options, async () => a);
  expect(result.old.records.every(r => r.status === 'failure' && r.errorCode === 'ADAPTER_FAILURE' && r.telemetry.modelCalls === 1)).toBe(true);
  a.run = async () => ({ output: { jokes: [] } });
  const invalid = await captureLive(requests, options, async () => a);
  expect(invalid.new.records.every(r => r.status === 'failure')).toBe(true);
});
it.each([0, 10])('malformed output retains measured failure telemetry including zero (%s)', async measured => {
  const a = adapter(); a.telemetryDefinition = { tokenSource: 'mock tokens', latencySource: 'mock milliseconds' };
  const measurements = { inputTokens: measured, outputTokens: measured, totalTokens: measured * 2, latencyMs: measured };
  a.run = async c => { await c.invokeModel({}); return { output: { jokes: [] }, telemetry: measurements }; };
  const captures = await captureLive(requests, options, async () => a);
  for (const capture of [captures.old, captures.new]) for (const r of capture.records) {
    expect(r.status).toBe('failure');
    expect(r.telemetry).toEqual({ ...measurements, modelCalls: 1 });
  }
  const p = prepare(requests, captures.old, captures.new, 'failure-measurements');
  const summary = summarize(p.blind, p.key, { schemaVersion: 1, packetId: p.blind.packetId, ratingKind: 'human', rows: [] }, captures.old, captures.new) as unknown as { telemetry: { old: Record<string, unknown>; paired: Record<string, unknown> } };
  expect(summary.telemetry.old.totalTokens).toEqual({ knownTotal: measured * 4, measured: 2, unknown: 0 });
  expect(summary.telemetry.old.latencyMs).toEqual({ knownTotal: measured * 2, measured: 2, unknown: 0 });
  expect(summary.telemetry.paired.totalTokens).toEqual({ meanDelta: 0, measuredPairs: 2, unknownPairs: 0 });
});
it('malformed output and invalid telemetry sanitize measurements but preserve harness calls', async () => {
  const a = adapter(); a.telemetryDefinition = { tokenSource: 'mock tokens', latencySource: 'mock milliseconds' };
  a.run = async c => { await c.invokeModel({}); return { output: { jokes: [] }, telemetry: { inputTokens: -1, outputTokens: 5, totalTokens: 4, latencyMs: 20, modelCalls: 99 } }; };
  const captures = await captureLive(requests, options, async () => a);
  for (const r of captures.old.records) {
    expect(r.status).toBe('failure');
    expect(r.telemetry).toEqual({ ...UNKNOWN_TELEMETRY, modelCalls: 1 });
  }
});
