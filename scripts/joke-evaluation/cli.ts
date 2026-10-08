import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonical, prepare, summarize } from './core';
import { requestsSchema } from './types';

const load = async (path: string): Promise<unknown> => JSON.parse(await readFile(path, 'utf8'));
const json = (value: unknown) => `${canonical(value)}\n`;
function options(argv: string[], allowed: string[]): Map<string, string> {
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (!allowed.includes(flag) || values.has(flag)) throw new Error('Unknown or duplicate option');
    if (flag === '--allow-live') { values.set(flag, 'true'); continue; }
    const value = argv[++i];
    if (!value || value.startsWith('--')) throw new Error('Missing option value');
    values.set(flag, value);
  }
  return values;
}
function required(values: Map<string, string>, name: string): string {
  const value = values.get(name); if (!value) throw new Error(`Required option ${name}`); return value;
}
function integer(values: Map<string, string>, name: string): number {
  const value = required(values, name);
  if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error(`Invalid integer ${name}`);
  return Number(value);
}
async function writePair(out: string, values: Record<string, unknown>): Promise<void> {
  // Exclusive directory creation prevents replacing any existing packet/capture.
  await mkdir(out, { mode: 0o700 });
  try { for (const [name, value] of Object.entries(values)) await writeFile(join(out, name), json(value), { flag: 'wx', mode: 0o600 }); }
  catch (error) { await rm(out, { recursive: true, force: true }); throw error; }
}
export async function main(argv: string[]): Promise<void> {
  const [command, ...args] = argv;
  if (command === 'prepare') {
    const opts = options(args, ['--requests', '--old', '--new', '--seed', '--out']);
    const out = required(opts, '--out');
    const packet = prepare(await load(required(opts, '--requests')), await load(required(opts, '--old')), await load(required(opts, '--new')), required(opts, '--seed'));
    await writePair(out, { 'blind.json': packet.blind, 'key.json': packet.key });
  } else if (command === 'summarize') {
    const opts = options(args, ['--blind', '--key', '--ratings', '--old', '--new', '--out']);
    const out = required(opts, '--out');
    if (!opts.has('--old') || !opts.has('--new')) throw new Error('Both frozen captures required for complete telemetry summary');
    const summary = summarize(await load(required(opts, '--blind')), await load(required(opts, '--key')), await load(required(opts, '--ratings')), await load(required(opts, '--old')), await load(required(opts, '--new')));
    await writeFile(out, json(summary), { flag: 'wx', mode: 0o600 });
  } else if (command === 'capture-live') {
    const opts = options(args, ['--allow-live', '--max-model-calls', '--max-cases', '--adapter', '--old-revision', '--new-revision', '--old-max-calls', '--new-max-calls', '--requests', '--out']);
    if (opts.get('--allow-live') !== 'true') throw new Error('Literal --allow-live required');
    const maxModelCalls = integer(opts, '--max-model-calls'), maxCases = integer(opts, '--max-cases');
    const plan = (variant: 'old' | 'new') => {
      const revision = required(opts, `--${variant}-revision`), calls = integer(opts, `--${variant}-max-calls`);
      if (!/^[a-f0-9]{40}$/.test(revision) || (calls !== 2 && calls !== 4)) throw new Error('Pinned revision and 2/4 variant ceiling required');
      return { revision, maxModelCalls: calls as 2 | 4 };
    };
    const old = plan('old'), next = plan('new'), adapterPath = required(opts, '--adapter'), out = required(opts, '--out');
    const requests = requestsSchema.parse(await load(required(opts, '--requests')));
    if (requests.cases.length > maxCases || requests.cases.length * (old.maxModelCalls + next.maxModelCalls) > maxModelCalls) throw new Error('Declared allocation exceeds budget');
    await mkdir(out, { mode: 0o700 });
    try {
      const { captureLive } = await import('./live');
      const captures = await captureLive(requests, { allowLive: true, maxModelCalls, maxCases, adapterPath, old, new: next });
      await writeFile(join(out, 'old.json'), json(captures.old), { flag: 'wx', mode: 0o600 });
      await writeFile(join(out, 'new.json'), json(captures.new), { flag: 'wx', mode: 0o600 });
    } catch (error) { await rm(out, { recursive: true, force: true }); throw error; }
  } else throw new Error('Expected prepare, summarize or capture-live');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(() => { console.error('Evaluation command failed: check options, schemas, hashes, budgets and exclusive output paths.'); process.exitCode = 1; });
}
