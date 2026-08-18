// @vitest-environment node
/**
 * Unit tests for the Firestore rules/indexes deploy orchestration. HTTP is
 * mocked at the global fetch level; google-auth-library is stubbed so no
 * real credentials or network are involved.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';

vi.mock('google-auth-library', () => ({
  GoogleAuth: class {
    getAccessToken() {
      return Promise.resolve('fake-token');
    }
  },
}));

import {
  deployFirestore,
  Credentials,
} from './firestore-deploy';

const PID = 'test-project';
const CREDS: Credentials = {
  projectId: PID,
  clientEmail: 'sa@test-project.iam.gserviceaccount.com',
  privateKey: 'unused-because-GoogleAuth-is-mocked',
};

interface IndexField {
  fieldPath: string;
  order?: 'ASCENDING' | 'DESCENDING';
  arrayConfig?: 'CONTAINS';
}

interface WantedIndex {
  collectionGroup: string;
  queryScope: string;
  fields: IndexField[];
}

interface RulesetSource {
  source: { files: { name: string; content: string }[] };
}

const localRules = fs.readFileSync('firestore.rules', 'utf-8');
const wantedIndexes: WantedIndex[] = (
  JSON.parse(fs.readFileSync('firestore.indexes.json', 'utf-8')) as { indexes: WantedIndex[] }
).indexes;

interface Call {
  method: string;
  url: string;
  body?: Record<string, unknown>;
}

function asDeployedIndex(spec: (typeof wantedIndexes)[number]) {
  return { name: `idx-${spec.collectionGroup}`, ...spec, state: 'READY' };
}

/** Stateful fetch mock: POSTing a ruleset makes it the deployed content. */
function makeFetchMock(deployedRules: string, deployedIndexes: unknown[]) {
  const calls: Call[] = [];
  let currentRules = deployedRules;
  let rulesetCounter = 0;

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  const fetchMock = async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const method = init?.method ?? 'GET';
    const body = init?.body
      ? (JSON.parse(String(init.body)) as Record<string, unknown>)
      : undefined;
    calls.push({ method, url: u, body });

    if (u.includes('firebaserules.googleapis.com')) {
      if (method === 'GET' && u.endsWith('/releases/cloud.firestore')) {
        return json({
          name: `projects/${PID}/releases/cloud.firestore`,
          rulesetName: `projects/${PID}/rulesets/rs-current`,
        });
      }
      if (method === 'GET' && u.includes('/rulesets/')) {
        return json({
          name: `projects/${PID}/rulesets/rs-current`,
          source: { files: [{ name: 'firestore.rules', content: currentRules }] },
        });
      }
      if (method === 'POST' && u.endsWith('/rulesets')) {
        rulesetCounter++;
        currentRules = (body as unknown as RulesetSource).source.files[0].content;
        return json({ name: `projects/${PID}/rulesets/rs-new-${rulesetCounter}` });
      }
      if (method === 'PATCH' && u.includes('/releases/cloud.firestore')) {
        return json({ name: body!.name, rulesetName: body!.rulesetName });
      }
    }
    if (u.includes('firestore.googleapis.com')) {
      if (method === 'GET' && u.includes('/collectionGroups/-/indexes')) {
        return json({ indexes: deployedIndexes });
      }
      if (method === 'POST' && u.endsWith('/indexes')) {
        return json({ name: 'operations/123' });
      }
    }
    throw new Error(`Unexpected ${method} ${u}`);
  };

  return { calls, fetchMock };
}

const DRIFTED_RULES = `// old version without the bounded rating update\n${localRules}`;

describe('deployFirestore', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('does nothing when rules and indexes are already in sync', async () => {
    const { calls, fetchMock } = makeFetchMock(localRules, wantedIndexes.map(asDeployedIndex));
    vi.stubGlobal('fetch', fetchMock);

    const result = await deployFirestore(CREDS);

    expect(result).toEqual({ rulesChanged: false, indexesCreated: 0 });
    expect(calls.filter((c) => c.method !== 'GET')).toEqual([]);
  });

  it('creates a ruleset, points the release at it, and verifies when rules differ', async () => {
    const { calls, fetchMock } = makeFetchMock(DRIFTED_RULES, wantedIndexes.map(asDeployedIndex));
    vi.stubGlobal('fetch', fetchMock);

    const result = await deployFirestore(CREDS);

    expect(result.rulesChanged).toBe(true);
    const writes = calls.filter((c) => c.method !== 'GET');
    expect(writes.map((c) => c.method)).toEqual(['POST', 'PATCH']);

    const post = writes[0];
    expect(post.url).toBe(`https://firebaserules.googleapis.com/v1/projects/${PID}/rulesets`);
    expect((post.body as unknown as RulesetSource).source.files[0].content).toBe(localRules);

    const patch = writes[1];
    expect(patch.url).toContain(`/projects/${PID}/releases/cloud.firestore`);
    expect(patch.url).toContain('updateMask=rulesetName');
    expect(patch.body!.rulesetName).toBe(`projects/${PID}/rulesets/rs-new-1`);

    // Verification re-fetches release + ruleset after the PATCH.
    const gets = calls.filter((c) => c.method === 'GET');
    expect(gets.filter((c) => c.url.endsWith('/releases/cloud.firestore'))).toHaveLength(2);
  });

  it('check-only mode reports drift but performs no writes', async () => {
    const { calls, fetchMock } = makeFetchMock(DRIFTED_RULES, []);
    vi.stubGlobal('fetch', fetchMock);

    const result = await deployFirestore(CREDS, { checkOnly: true });

    expect(result).toEqual({ rulesChanged: false, indexesCreated: 0 });
    expect(calls.filter((c) => c.method !== 'GET')).toEqual([]);
  });

  it('creates only the missing indexes', async () => {
    const present = wantedIndexes.slice(0, 2).map(asDeployedIndex);
    const missingCount = wantedIndexes.length - 2;
    const { calls, fetchMock } = makeFetchMock(localRules, present);
    vi.stubGlobal('fetch', fetchMock);

    const result = await deployFirestore(CREDS);

    expect(result.indexesCreated).toBe(missingCount);
    const indexPosts = calls.filter(
      (c) => c.method === 'POST' && c.url.includes('firestore.googleapis.com')
    );
    expect(indexPosts).toHaveLength(missingCount);
    for (const post of indexPosts) {
      expect(post.url).toContain(`/projects/${PID}/databases/(default)/collectionGroups/jokes/indexes`);
      const indexBody = post.body as unknown as { queryScope: string; fields: IndexField[] };
      expect(indexBody.queryScope).toBe('COLLECTION');
      expect(indexBody.fields.length).toBeGreaterThan(0);
    }
  });

  it('throws when the deployed ruleset does not match local after the push', async () => {
    const { calls, fetchMock } = makeFetchMock(DRIFTED_RULES, wantedIndexes.map(asDeployedIndex));
    // Break the mock: POSTing a ruleset never actually updates the deployed
    // content, so post-deploy verification must fail.
    const broken = async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === 'POST' && u.endsWith('/rulesets')) {
        calls.push({ method: 'POST', url: u, body: JSON.parse(String(init.body)) });
        return new Response(
          JSON.stringify({ name: `projects/${PID}/rulesets/rs-broken` }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return fetchMock(url, init);
    };
    vi.stubGlobal('fetch', broken);

    await expect(deployFirestore(CREDS)).rejects.toThrow('Post-deploy verification failed');
  });
});

describe('migration 003', () => {
  it('is discoverable by the migrations runner and exposes a default export', async () => {
    const files = fs
      .readdirSync('migrations')
      .filter((f) => /^\d+.*\.ts$/.test(f))
      .sort();
    expect(files).toContain('003-deploy-firestore-rules-and-indexes.ts');
    // The runner skips applied migrations by filename minus .ts.
    expect(files[files.indexOf('003-deploy-firestore-rules-and-indexes.ts')].replace(/\.ts$/, ''))
      .toBe('003-deploy-firestore-rules-and-indexes');

    const migration = await import('../migrations/003-deploy-firestore-rules-and-indexes');
    expect(typeof migration.default).toBe('function');
  });
});
