// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it } from 'vitest';
import { main } from './cli';

it('offline prepare/summarize run under subprocess import tripwire, deterministic exclusive outputs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'joke-offline-'));
  try {
    const loader = join(dir, 'tripwire.mjs');
    await writeFile(loader, `export async function resolve(specifier, context, next) { if (/genkit|firebase|dotenv|src\\/ai|src\\/app|src\\/lib\\/admin/.test(specifier)) throw new Error('FORBIDDEN_OFFLINE_IMPORT'); return next(specifier, context); }`);
    const fixtures = resolve('scripts/joke-evaluation/fixtures');
    const command = ['--import', 'tsx', '--loader', loader, 'scripts/joke-evaluation/cli.ts'];
    const prep = (out: string) => execFileSync(process.execPath, [...command, 'prepare', '--requests', join(fixtures, 'requests.v1.json'), '--old', join(fixtures, 'synthetic-old.v1.json'), '--new', join(fixtures, 'synthetic-new.v1.json'), '--seed', 'demo-v1', '--out', out], { encoding: 'utf8', stdio: 'pipe' });
    prep(join(dir, 'one')); prep(join(dir, 'two'));
    expect(await readFile(join(dir, 'one/blind.json'), 'utf8')).toBe(await readFile(join(dir, 'two/blind.json'), 'utf8'));
    expect(() => prep(join(dir, 'one'))).toThrow();
    execFileSync(process.execPath, [...command, 'summarize', '--blind', join(dir, 'one/blind.json'), '--key', join(dir, 'one/key.json'), '--ratings', join(fixtures, 'synthetic-ratings.v1.json'), '--old', join(fixtures, 'synthetic-old.v1.json'), '--new', join(fixtures, 'synthetic-new.v1.json'), '--out', join(dir, 'summary.json')], { stdio: 'pipe' });
    const summary = JSON.parse(await readFile(join(dir, 'summary.json'), 'utf8'));
    expect(summary.synthetic).toBe(true); expect(summary.quality.status).toBe('not-evaluated');
    expect(summary.reliability.plannedCases).toBe(8);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
it('CLI rejects unknown flags and invalid capture-live options before adapter import or output', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'joke-live-gate-'));
  try {
    const adapter = join(dir, 'adapter.mjs'), marker = join(dir, 'IMPORTED');
    await writeFile(adapter, `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(marker)}, 'bad'); export default {};`);
    for (const flags of [[], ['--allow-live'], ['--allow-live', '--max-model-calls', '0']]) {
      await expect(main(['capture-live', '--adapter', adapter, '--requests', 'scripts/joke-evaluation/fixtures/requests.v1.json', '--out', join(dir, 'capture'), ...flags])).rejects.toThrow();
    }
    expect(await readdir(dir)).toEqual(['adapter.mjs']);
    await expect(main(['prepare', '--surprise', 'true'])).rejects.toThrow();
  } finally { await rm(dir, { recursive: true, force: true }); }
});
