// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ deployFirestore: vi.fn(), existsSync: vi.fn() }));
// The CLI loads dotenv; never let a test read the local .env.
vi.mock('dotenv/config', () => ({}));
vi.mock('./firestore-deploy', () => ({ deployFirestore: mocks.deployFirestore, credentialsFromServiceAccount: vi.fn() }));
vi.mock('fs', () => ({ default: { existsSync: mocks.existsSync, readFileSync: vi.fn() } }));

const originalArgv = process.argv;
let exit: ReturnType<typeof vi.spyOn>;
let consoleError: ReturnType<typeof vi.spyOn>;

async function runCli(args: string[] = []) {
  process.argv = [originalArgv[0], 'deploy-firestore.ts', ...args];
  await import('./deploy-firestore');
  await new Promise(resolve => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.resetModules();
  mocks.deployFirestore.mockReset().mockResolvedValue(undefined);
  mocks.existsSync.mockReset().mockReturnValue(false);
  vi.stubEnv('FIREBASE_PROJECT_ID', '');
  vi.stubEnv('FIREBASE_CLIENT_EMAIL', '');
  vi.stubEnv('FIREBASE_PRIVATE_KEY', '');
  exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  process.argv = originalArgv;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('deploy-firestore CLI', () => {
  it.each([[[] as string[]], [['--check']]])('missing credentials prints the message and exits 1 (args %j)', async (args) => {
    await runCli(args);
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('No Firebase admin credentials found'));
    expect(exit).toHaveBeenCalledWith(1);
    expect(mocks.deployFirestore).not.toHaveBeenCalled();
  });

  it('env credentials are passed to deployFirestore', async () => {
    vi.stubEnv('FIREBASE_PROJECT_ID', 'p');
    vi.stubEnv('FIREBASE_CLIENT_EMAIL', 'e');
    vi.stubEnv('FIREBASE_PRIVATE_KEY', 'k\\nk');
    await runCli();
    expect(mocks.deployFirestore).toHaveBeenCalledWith(
      { projectId: 'p', clientEmail: 'e', privateKey: 'k\nk' },
      { checkOnly: false },
    );
    expect(exit).not.toHaveBeenCalled();
  });
});
