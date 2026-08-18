/**
 * CLI wrapper around scripts/firestore-deploy.ts.
 *
 * Usage:
 *   npm run firestore:push            # deploy rules + indexes
 *   npm run firestore:push -- --check # read-only: diff local vs deployed
 *
 * Credentials (checked in order, matching the repo's existing conventions):
 *   1. FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY
 *      env vars — the same ones src/lib/admin.ts uses on Vercel (a local
 *      .env works too, via dotenv).
 *   2. ./firebase-admin-credentials.json — the service-account JSON the
 *      migrations runner reads (gitignored).
 */

import fs from 'fs';
import path from 'path';
import 'dotenv/config';
import {
  Credentials,
  credentialsFromServiceAccount,
  deployFirestore,
} from './firestore-deploy';

const CREDS_PATH = path.join(process.cwd(), 'firebase-admin-credentials.json');

function readCredentials(): Credentials {
  // Path 1: env vars, same shape as src/lib/admin.ts.
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (projectId && clientEmail && privateKey) {
    return { projectId, clientEmail, privateKey };
  }
  // Path 2: service-account JSON at repo root, same file migrations use.
  if (fs.existsSync(CREDS_PATH)) {
    return credentialsFromServiceAccount(
      JSON.parse(fs.readFileSync(CREDS_PATH, 'utf-8'))
    );
  }
  throw new Error(
    'No Firebase admin credentials found. Either set FIREBASE_PROJECT_ID / ' +
      'FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY (env or .env), or drop ' +
      'firebase-admin-credentials.json (the migrations one, gitignored) at the repo root.'
  );
}

deployFirestore(readCredentials(), { checkOnly: process.argv.includes('--check') }).catch(
  (err) => {
    console.error(err.message ?? err);
    process.exit(1);
  }
);
