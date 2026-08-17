import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/admin';
import type { Joke } from '@/lib/types';

const JOKES_COLLECTION = 'jokes';

export interface FetchTopJokesOptions {
  limit?: number;
  minRating?: number;
}

/**
 * Server-side counterpart of the client joke queries: the Admin SDK bypasses
 * security rules, so this runs with the route's own authorization rather than
 * as an anonymous browser client, and keeps the client Firestore SDK out of
 * the server bundle. Same pattern as `/api/jokes/add` and `/api/explain-joke`.
 */

/** Admin-SDK `Timestamp` is a different class from the client one — see `@/lib/firestoreTimestamps`. */
function toDate(value: unknown): Date {
  return value instanceof Timestamp ? value.toDate() : new Date(0);
}

export async function fetchTopJokes(options: FetchTopJokesOptions = {}): Promise<Joke[]> {
  const { limit: pageLimit = 10, minRating = 4 } = options;

  const snapshot = await adminDb
    .collection(JOKES_COLLECTION)
    .where('averageRating', '>=', minRating)
    .orderBy('averageRating', 'desc')
    .limit(pageLimit)
    .get();

  return snapshot.docs.map((docSnapshot) => {
    const data = docSnapshot.data();
    return {
      id: docSnapshot.id,
      ...data,
      dateAdded: toDate(data.dateAdded),
    } as Joke;
  });
}
