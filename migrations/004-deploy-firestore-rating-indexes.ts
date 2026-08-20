import { Firestore } from 'firebase-admin/firestore';
import fs from 'fs';
import {
  credentialsFromServiceAccount,
  deployFirestore,
} from '../scripts/firestore-deploy';

/**
 * Re-deploys firestore.rules + firestore.indexes.json after the rating-filter
 * change added the averageRating composite indexes (band + dateAdded, and the
 * userId/category/used combinations). 003 is recorded as applied and never
 * re-runs, so this is a new number calling the same shared deploy lib.
 *
 * Idempotent: rules push only on drift, existing indexes are skipped. The
 * `db` argument is unused — this is repo state, not db state.
 */
export default async function deployRulesAndIndexesAgain(_db: Firestore) {
  const sa = JSON.parse(
    fs.readFileSync('./firebase-admin-credentials.json', 'utf-8')
  );
  await deployFirestore(credentialsFromServiceAccount(sa));
}
