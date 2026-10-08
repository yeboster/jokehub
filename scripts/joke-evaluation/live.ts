import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { z } from 'zod';
import { canonical, digest, effectiveInput } from './core';
import { DEFAULT_MODEL, DEFAULT_TEMPERATURE, MODELS, UNKNOWN_TELEMETRY, captureSchema, outputSchema, requestsSchema, telemetrySchema, type Capture, type Input, type Output, type Requests, type Telemetry } from './types';
export type VariantPlan = { revision: string; maxModelCalls: 2 | 4 };
export type LiveOptions = {
  allowLive: boolean; maxModelCalls: number; maxCases: number; adapterPath: string;
  old: VariantPlan; new: VariantPlan; model?: Capture['model']; temperature?: number;
};
export type Adapter = {
  adapterVersion: string; captureKind: 'mock' | 'live';
  telemetryDefinition: Capture['telemetryDefinition'];
  plan: { old: VariantPlan; new: VariantPlan };
  invokeModel: (request: unknown) => Promise<unknown>;
  run: (context: { variant: 'old' | 'new'; revision: string; input: Input; invokeModel: (request: unknown) => Promise<unknown> }) => Promise<{ output: Output; telemetry?: Partial<Telemetry> }>;
};
const planSchema = z.object({ revision: z.string().regex(/^[a-f0-9]{40}$/), maxModelCalls: z.union([z.literal(2), z.literal(4)]) }).strict();
const optionsSchema = z.object({
  allowLive: z.literal(true), maxModelCalls: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), maxCases: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  adapterPath: z.string().trim().min(1), old: planSchema, new: planSchema,
  model: z.enum(MODELS).optional(), temperature: z.number().finite().min(0).max(2).optional(),
}).strict();
export async function captureLive(rawRequests: Requests, rawOptions: LiveOptions, loadAdapter: (path: string) => Promise<unknown> = async path => (await import(pathToFileURL(resolve(path)).href)).default): Promise<{ old: Capture; new: Capture }> {
  const requests = requestsSchema.parse(rawRequests), options = optionsSchema.parse(rawOptions);
  if (requests.cases.length > options.maxCases) throw new Error('Case budget exceeded');
  const caseAllocation = options.old.maxModelCalls + options.new.maxModelCalls;
  if (requests.cases.length * caseAllocation > options.maxModelCalls) throw new Error('Declared worst-case allocation exceeds budget');
  const model = options.model ?? DEFAULT_MODEL, temperature = options.temperature ?? DEFAULT_TEMPERATURE;
  const inputs = requests.cases.map(c => effectiveInput(c.input, model, temperature));
  if (inputs.some(i => i.model !== model || i.temperature !== temperature)) throw new Error('Effective settings mismatch');
  // Only trusted audited code may cross this import boundary. This is not a sandbox.
  const adapter = await loadAdapter(options.adapterPath) as Adapter;
  if (!adapter || typeof adapter.run !== 'function' || typeof adapter.invokeModel !== 'function') throw new Error('Invalid trusted adapter');
  const declaredPlan = z.object({ old: planSchema, new: planSchema }).strict().parse(adapter.plan);
  if (canonical(declaredPlan) !== canonical({ old: options.old, new: options.new })) throw new Error('Adapter plan mismatch');
  const make = (variant: 'old' | 'new'): Capture => captureSchema.parse({ schemaVersion: 1, variantId: variant, sourceCommit: options[variant].revision, fixtureHash: digest(requests), model, temperature, captureKind: adapter.captureKind, adapterVersion: adapter.adapterVersion, telemetryDefinition: adapter.telemetryDefinition, records: [] });
  const old = make('old'), next = make('new');
  let reserved = 0, totalCalls = 0;
  for (let i = 0; i < requests.cases.length; i++) {
    if (reserved + caseAllocation > options.maxModelCalls) throw new Error('Next case allocation exceeds budget');
    reserved += caseAllocation;
    for (const variant of ['old', 'new'] as const) {
      const capture = variant === 'old' ? old : next, item = requests.cases[i];
      let calls = 0, active = true, exhausted = false;
      const pending: Promise<unknown>[] = [];
      const invokeModel = (request: unknown): Promise<unknown> => {
        if (!active) return Promise.reject(new Error('Model capability closed'));
        if (calls >= options[variant].maxModelCalls || totalCalls >= options.maxModelCalls) {
          exhausted = true;
          return Promise.reject(new Error('Model budget exhausted'));
        }
        // Charge attempted application invocation before execution, including rejected calls.
        calls++; totalCalls++;
        const promise = Promise.resolve().then(() => adapter.invokeModel(request));
        pending.push(promise);
        return promise;
      };
      let result: { output: Output; telemetry?: Partial<Telemetry> } | undefined;
      let failed = false;
      try { result = await adapter.run({ variant, revision: options[variant].revision, input: structuredClone(inputs[i]), invokeModel }); }
      catch { failed = true; }
      finally { active = false; }
      const settled = await Promise.allSettled(pending);
      if (settled.some(r => r.status === 'rejected')) failed = true;
      let telemetry: Telemetry = { ...UNKNOWN_TELEMETRY, modelCalls: calls };
      try {
        if (result?.telemetry) telemetry = telemetrySchema.parse({ ...telemetry, ...result.telemetry, modelCalls: calls });
        const base = { caseId: item.caseId, inputHash: digest(inputs[i]), telemetry };
        if (exhausted || failed || !result) {
          capture.records.push({ ...base, status: 'failure', errorCode: exhausted ? 'MODEL_BUDGET_EXHAUSTED' : 'ADAPTER_FAILURE' });
        } else capture.records.push({ ...base, status: 'success', output: outputSchema.parse(result.output) });
      } catch {
        capture.records.push({ caseId: item.caseId, inputHash: digest(inputs[i]), telemetry, status: 'failure', errorCode: 'INVALID_ADAPTER_RESULT' });
      }
    }
  }
  return { old: captureSchema.parse(old), new: captureSchema.parse(next) };
}
