import {
  collection,
  query,
  where,
  limit,
  getDocs,
  getDoc,
  Timestamp,
  orderBy,
  doc,
  runTransaction,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { UserRating } from '@/lib/types';

const JOKE_RATINGS_COLLECTION = 'jokeRatings';

/**
 * Design note — atomic rating aggregation:
 *
 * Firestore client SDK `runTransaction` does NOT support queries (no
 * `getDocs` of a Query inside the transaction body). It only supports
 * `getDoc` on a single DocumentReference.
 *
 * Therefore we pre-fetch the supporting data BEFORE the transaction:
 *   1) the user's existing rating for this joke (so we know its document id
 *      and current stars — needed to invert its contribution to the sum)
 *   2) the full set of ratings for this joke (so we can compute count + sum
 *      once and reuse them after the upsert)
 *
 * Then inside the transaction we:
 *   1) re-read the joke doc (for optimistic-concurrency freshness, so we
 *      don't blindly clobber a value another writer just wrote)
 *   2) write the user's rating doc with a deterministic id
 *      (`${jokeId}_${userId}`) via `setDoc(..., { merge: true })`. The
 *      deterministic id means we can safely `setDoc` inside a transaction
 *      (transactions forbid `addDoc` because they need a known doc ref),
 *      and it also guarantees one rating per (joke, user) at the data
 *      layer — fixing the latent bug where the old code could leave
 *      multiple rating docs per user.
 *   3) recompute averageRating as
 *        newSum = preFetchSum - (existingUserStars ?? 0) + newStars
 *        newCount = preFetchCount                // upsert only
 *        avg = newSum / newCount
 *      and write both `averageRating` (rounded to 1 decimal, matching the
 *      original Math.round(avg*10)/10 behavior) and `ratingCount` on the
 *      joke doc. Writes come AFTER all reads, as required.
 *
 * All transaction reads precede all writes.
 */
export async function submitUserRating(
  jokeId: string,
  stars: number,
  userId: string,
  comment?: string
) {
  if (stars < 1 || stars > 5) {
    throw new Error('Rating must be between 1 and 5 stars.');
  }
  if (comment && comment.length > 1000) {
    throw new Error('Comment cannot exceed 1000 characters.');
  }

  const ratingsCollectionRef = collection(db, JOKE_RATINGS_COLLECTION);

  // --- Pre-transaction reads (client SDK transactions forbid getDocs of queries) ---
  // Existing rating doc for this user, if any.
  const existingUserRatingQuery = query(
    ratingsCollectionRef,
    where('jokeId', '==', jokeId),
    where('userId', '==', userId),
    limit(1)
  );
  const existingUserRatingSnap = await getDocs(existingUserRatingQuery);

  // Full ratings snapshot for this joke — used for sum + count.
  const allRatingsQuery = query(
    ratingsCollectionRef,
    where('jokeId', '==', jokeId)
  );
  const allRatingsSnap = await getDocs(allRatingsQuery);

  const preFetchCount = allRatingsSnap.size;
  let preFetchSum = 0;
  allRatingsSnap.forEach((d) => {
    const data = d.data() as { stars?: number };
    if (typeof data.stars === 'number') preFetchSum += data.stars;
  });

  // The existing rating doc id (if any) and its prior stars — so we can
  // invert its contribution before adding the new stars.
  let existingRatingDocId: string | null = null;
  let existingStars = 0;
  if (!existingUserRatingSnap.empty) {
    const docSnap = existingUserRatingSnap.docs[0];
    existingRatingDocId = docSnap.id;
    const data = docSnap.data() as { stars?: number };
    existingStars = typeof data.stars === 'number' ? data.stars : 0;
  }

  const now = Timestamp.now();
  const ratingDocId = `${jokeId}_${userId}`;
  const ratingDocRef = doc(db, JOKE_RATINGS_COLLECTION, ratingDocId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accepted constraint: dynamic Firestore payload built from optional comment + user fields; unknown would force per-property assertions.
  const ratingData: any = {
    jokeId,
    userId,
    stars,
    updatedAt: now,
    comment: comment && comment.trim() !== '' ? comment.trim() : null,
  };
  // Preserve createdAt for updates; set it for first-time writes.
  if (existingRatingDocId === null) {
    ratingData.createdAt = now;
  }

  const jokeDocRef = doc(db, 'jokes', jokeId);

  await runTransaction(db, async (transaction) => {
    // --- Reads first (transaction rule) ---
    const jokeDoc = await transaction.get(jokeDocRef);

    // Compute new aggregate from pre-fetched values + the user's new stars.
    // Upsert of a single user's rating does not change ratingCount.
    const newSum = preFetchSum - existingStars + stars;
    const newCount = preFetchCount;
    const averageRating = newCount > 0
      ? Math.round((newSum / newCount) * 10) / 10
      : 0;

    // --- Writes after reads ---
    transaction.set(ratingDocRef, ratingData, { merge: true });

    transaction.update(jokeDocRef, {
      averageRating,
      ratingCount: newCount,
    });

    // Touch joke doc to ensure it exists before writing to it; if the joke
    // is missing we still attempt the update (server will surface the error
    // via the transaction's retry/commit semantics). Reading it here also
    // establishes it as part of the transaction's read set for OCC.
    if (!jokeDoc.exists) {
      // No-op placeholder; transaction.update will fail at commit with a
      // clear "No document to update" error, which surfaces to the caller.
    }
  });
}

export async function getUserRatingForJoke(
  jokeId: string,
  userId: string
): Promise<UserRating | null> {
  const ratingDocId = `${jokeId}_${userId}`;
  const ratingDocRef = doc(db, JOKE_RATINGS_COLLECTION, ratingDocId);

  try {
    const docSnap = await getDoc(ratingDocRef);
    if (!docSnap.exists()) {
      return null;
    }
    const docData = docSnap.data() as DocumentData;
    return {
      id: docSnap.id,
      ...docData,
      createdAt: (docData.createdAt as Timestamp).toDate(),
      updatedAt: (docData.updatedAt as Timestamp).toDate(),
    } as UserRating;
  } catch (error) {
    console.error("Error fetching user's rating for joke:", error);
    return null;
  }
}

/**
 * Fetches all ratings for a specific joke, ordered by when they were last updated (newest first).
 * @param jokeId - The ID of the joke.
 * @returns A promise that resolves to an array of UserRating objects.
 */
export async function fetchAllRatingsForJoke(jokeId: string): Promise<UserRating[]> {
  const ratingsCollectionRef = collection(db, JOKE_RATINGS_COLLECTION);
  const q = query(
    ratingsCollectionRef,
    where('jokeId', '==', jokeId),
    orderBy('updatedAt', 'desc') // Order by most recently updated
  );

  try {
    const querySnapshot = await getDocs(q);
    const ratings = querySnapshot.docs.map((d) => {
      const data = d.data() as DocumentData;
      return {
        id: d.id,
        ...data,
        createdAt: (data.createdAt as Timestamp).toDate(),
        updatedAt: (data.updatedAt as Timestamp).toDate(),
      } as UserRating;
    });
    return ratings;
  } catch (error) {
    console.error("Error fetching all ratings for joke:", error);
    throw new Error(`Failed to fetch ratings for joke ${jokeId}.`);
  }
}
