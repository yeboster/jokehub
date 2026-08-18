/**
 * Shared library: deploy Firestore security rules + composite indexes from
 * the local repo via the Google REST APIs — no `firebase login` needed.
 * Source of truth is always the local files:
 *
 *   - firestore.rules          -> Firestore Security Rules release
 *   - firestore.indexes.json   -> composite indexes (creates missing ones)
 *
 * Used by:
 *   - scripts/deploy-firestore.ts (npm run firestore:push) — CLI wrapper
 *     that also resolves credentials
 *   - migrations/003-deploy-firestore-rules-and-indexes.ts — runs the deploy
 *     through the migrations framework on any machine that already has the
 *     service-account JSON
 */

import fs from 'fs';
import path from 'path';
import { GoogleAuth } from 'google-auth-library';

const RULES_PATH = path.join(process.cwd(), 'firestore.rules');
const INDEXES_PATH = path.join(process.cwd(), 'firestore.indexes.json');
const DATABASE = '(default)';

export interface Credentials {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

/** Parses the service-account JSON shape (snake_case) into Credentials. */
export function credentialsFromServiceAccount(sa: {
  project_id: string;
  client_email: string;
  private_key: string;
}): Credentials {
  return {
    projectId: sa.project_id,
    clientEmail: sa.client_email,
    privateKey: sa.private_key,
  };
}

interface IndexField {
  fieldPath: string;
  order?: 'ASCENDING' | 'DESCENDING';
  arrayConfig?: 'CONTAINS';
}

interface IndexSpec {
  collectionGroup: string;
  queryScope: 'COLLECTION' | 'COLLECTION_GROUP';
  fields: IndexField[];
}

// Loosely-typed JSON payloads from the Google REST APIs.
type Json = Record<string, unknown>;

async function authedFetch(
  auth: GoogleAuth,
  url: string,
  init?: { method?: string; body?: unknown }
): Promise<{ status: number; data: Json }> {
  const token = await auth.getAccessToken();
  const res = await fetch(url, {
    method: init?.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let data: Json = {};
  try {
    data = text ? (JSON.parse(text) as Json) : {};
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data };
}

function fail(step: string, status: number, data: Json): never {
  throw new Error(`${step} failed (HTTP ${status}): ${JSON.stringify(data)}`);
}

// ---------------------------------------------------------------- rules ----

interface RulesRelease {
  rulesetName: string;
}

interface Ruleset {
  name: string;
  source?: { files?: { content: string }[] };
}

interface DeployedIndex {
  collectionGroup: string;
  fields: IndexField[];
}

async function getDeployedRules(
  auth: GoogleAuth,
  projectId: string
): Promise<{ rulesetName: string; content: string }> {
  const rel = await authedFetch(
    auth,
    `https://firebaserules.googleapis.com/v1/projects/${projectId}/releases/cloud.firestore`
  );
  if (rel.status !== 200) fail('Get rules release', rel.status, rel.data);
  const { rulesetName } = rel.data as unknown as RulesRelease;

  const rs = await authedFetch(
    auth,
    `https://firebaserules.googleapis.com/v1/${rulesetName}`
  );
  if (rs.status !== 200) fail('Get ruleset', rs.status, rs.data);
  const ruleset = rs.data as unknown as Ruleset;
  const content = (ruleset.source?.files ?? []).map((f) => f.content).join('\n');
  return { rulesetName, content };
}

async function deployRules(
  auth: GoogleAuth,
  projectId: string,
  localRules: string
): Promise<void> {
  const created = await authedFetch(
    auth,
    `https://firebaserules.googleapis.com/v1/projects/${projectId}/rulesets`,
    {
      method: 'POST',
      body: {
        source: { files: [{ name: 'firestore.rules', content: localRules }] },
      },
    }
  );
  if (created.status !== 200) fail('Create ruleset', created.status, created.data);
  const rulesetName: string = (created.data as unknown as Ruleset).name;

  const updated = await authedFetch(
    auth,
    `https://firebaserules.googleapis.com/v1/projects/${projectId}/releases/cloud.firestore?updateMask=rulesetName`,
    {
      method: 'PATCH',
      body: {
        name: `projects/${projectId}/releases/cloud.firestore`,
        rulesetName,
      },
    }
  );
  if (updated.status !== 200) fail('Point release at ruleset', updated.status, updated.data);
  console.log(`  release cloud.firestore -> ${rulesetName}`);
}

// -------------------------------------------------------------- indexes ----

function fieldSignature(fields: IndexField[]): string {
  return fields
    .map((f) => `${f.fieldPath}:${f.order ?? f.arrayConfig ?? ''}`)
    .join('|');
}

async function listDeployedIndexes(
  auth: GoogleAuth,
  projectId: string
): Promise<Set<string>> {
  const res = await authedFetch(
    auth,
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${DATABASE}/collectionGroups/-/indexes?pageSize=500`
  );
  if (res.status !== 200) fail('List indexes', res.status, res.data);
  const existing = new Set<string>();
  for (const idx of (res.data.indexes as DeployedIndex[] | undefined) ?? []) {
    existing.add(`${idx.collectionGroup}|${fieldSignature(idx.fields)}`);
  }
  return existing;
}

async function createIndex(
  auth: GoogleAuth,
  projectId: string,
  spec: IndexSpec
): Promise<void> {
  const res = await authedFetch(
    auth,
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${DATABASE}/collectionGroups/${spec.collectionGroup}/indexes`,
    {
      method: 'POST',
      body: {
        queryScope: spec.queryScope,
        fields: spec.fields.map((f) =>
          f.order
            ? { fieldPath: f.fieldPath, order: f.order }
            : { fieldPath: f.fieldPath, arrayConfig: f.arrayConfig }
        ),
      },
    }
  );
  if (res.status !== 200) fail(`Create index on ${spec.collectionGroup}`, res.status, res.data);
  console.log(
    `  building: ${spec.collectionGroup} (${spec.fields
      .map((f) => f.fieldPath)
      .join(', ')}) — async, takes a few minutes`
  );
}

// ------------------------------------------------------------- exported ----

export interface DeployResult {
  rulesChanged: boolean;
  indexesCreated: number;
}

/**
 * Pushes local firestore.rules + firestore.indexes.json to the project the
 * credentials belong to. With checkOnly=true it only reports the drift.
 * Idempotent: in-sync rules are left alone, existing indexes are skipped.
 */
export async function deployFirestore(
  creds: Credentials,
  opts: { checkOnly?: boolean } = {}
): Promise<DeployResult> {
  const checkOnly = opts.checkOnly ?? false;
  const projectId = creds.projectId;
  console.log(
    `Project: ${projectId} (via ${creds.clientEmail})${checkOnly ? ' [check only]' : ''}`
  );

  const auth = new GoogleAuth({
    credentials: {
      project_id: creds.projectId,
      client_email: creds.clientEmail,
      private_key: creds.privateKey,
    },
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });

  const result: DeployResult = { rulesChanged: false, indexesCreated: 0 };

  // --- rules ---
  const localRules = fs.readFileSync(RULES_PATH, 'utf-8');
  const deployed = await getDeployedRules(auth, projectId);
  const rulesInSync = deployed.content.trim() === localRules.trim();
  console.log(
    rulesInSync
      ? `Rules: IN SYNC (deployed ruleset ${deployed.rulesetName})`
      : `Rules: DIFFER from deployed ruleset ${deployed.rulesetName}`
  );
  if (!rulesInSync && !checkOnly) {
    await deployRules(auth, projectId, localRules);
    const after = await getDeployedRules(auth, projectId);
    if (after.content.trim() !== localRules.trim()) {
      throw new Error('Post-deploy verification failed: deployed rules != local firestore.rules');
    }
    console.log('Rules: deployed and verified against local file.');
    result.rulesChanged = true;
  }

  // --- indexes ---
  const wanted: IndexSpec[] = JSON.parse(fs.readFileSync(INDEXES_PATH, 'utf-8')).indexes ?? [];
  const existing = await listDeployedIndexes(auth, projectId);
  const missing = wanted.filter(
    (spec) => !existing.has(`${spec.collectionGroup}|${fieldSignature(spec.fields)}`)
  );
  console.log(
    missing.length === 0
      ? `Indexes: all ${wanted.length} composite indexes from firestore.indexes.json exist.`
      : `Indexes: ${missing.length} of ${wanted.length} missing.`
  );
  if (!checkOnly) {
    for (const spec of missing) {
      await createIndex(auth, projectId, spec);
    }
    if (missing.length > 0) {
      console.log('Index builds started; queries depending on them work once each leaves BUILDING state.');
    }
    result.indexesCreated = missing.length;
  }
  return result;
}
