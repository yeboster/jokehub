import { Firestore } from 'firebase-admin/firestore';
import fs from 'fs';
import {
  credentialsFromServiceAccount,
  deployFirestore,
} from '../scripts/firestore-deploy';

/**
 * Deploys the local firestore.rules + firestore.indexes.json to production.
 *
 * Unlike data migrations this one is about repo state, not db state — the
 * `db` argument is unused. The service-account JSON is re-read from the same
 * path the migrations runner already loaded it from, so this works on any
 * machine where `npm run migrations` works.
 *
 * Idempotent by design: rules are only pushed when they differ from the
 * deployed ruleset (and the push is verified afterwards), indexes that
 * already exist are skipped. Re-running after a rules change, however,
 * requires a NEW migration file — applied migrations are recorded in the
 * `migrations` collection and never re-run.
 */
export default async function deployRulesAndIndexes(_db: Firestore) {
  const sa = JSON.parse(
    fs.readFileSync('./firebase-admin-credentials.json', 'utf-8')
  );
  await deployFirestore(credentialsFromServiceAccount(sa));
}
