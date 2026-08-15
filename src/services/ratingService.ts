import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  getDoc,
  Timestamp,
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
 * The joke doc carries running totals (`ratingSum`, `ratingCount`) so a
 * rating submit only needs 2 reads — the joke doc and the user's rating doc
 * (a deterministic id, so no query is needed to find it) — instead of
 * reading every rating doc for the joke.
 *
 * Inside the transaction we:
 *   1) read the joke doc and the user's rating doc (`${jokeId}_${userId}`).
 *   2) compute the delta: an existing rating shifts the sum by
 *      (newStars - oldStars) with count unchanged (upsert); a new rating
 *      adds newStars to the sum and increments count.
 *   3) write the rating doc (deterministic id, so `transaction.set(...,
 *      { merge: true })` is safe — transactions forbid `addDoc`) and update
 *      the joke doc's `ratingSum`, `ratingCount`, and `averageRating`.
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

  const now = Timestamp.now();
  const ratingDocId = `${jokeId}_${userId}`;
  const ratingDocRef = doc(db, JOKE_RATINGS_COLLECTION, ratingDocId);
  const jokeDocRef = doc(db, 'jokes', jokeId);

  await runTransaction(db, async (transaction) => {
    // --- Reads first (transaction rule) ---
    const jokeSnap = await transaction.get(jokeDocRef);
    const existingRatingSnap = await transaction.get(ratingDocRef);

    if (!jokeSnap.exists()) {
      throw new Error(`Joke ${jokeId} not found.`);
    }

    const jokeData = jokeSnap.data() as {
      averageRating?: number;
      ratingCount?: number;
      ratingSum?: number;
    };
    const existingStars = existingRatingSnap.exists()
      ? (existingRatingSnap.data() as { stars?: number }).stars
      : undefined;

    const currentCount = jokeData.ratingCount ?? 0;
    // Legacy jokes have averageRating/ratingCount but no ratingSum yet —
    // derive it once from the stored average so old totals aren't lost.
    const currentSum = jokeData.ratingSum ?? Math.round((jokeData.averageRating ?? 0) * currentCount);

    let newSum: number;
    let newCount: number;
    if (typeof existingStars === 'number') {
      newSum = currentSum - existingStars + stars;
      newCount = currentCount;
    } else {
      newSum = currentSum + stars;
      newCount = currentCount + 1;
    }
    const averageRating = newCount > 0 ? Math.round((newSum / newCount) * 10) / 10 : 0;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accepted constraint: dynamic Firestore payload built from optional comment + user fields; unknown would force per-property assertions.
    const ratingData: any = {
      jokeId,
      userId,
      stars,
      updatedAt: now,
      comment: comment && comment.trim() !== '' ? comment.trim() : null,
    };
    // Preserve createdAt for updates; set it for first-time writes.
    if (!existingRatingSnap.exists()) {
      ratingData.createdAt = now;
    }

    // --- Writes after reads ---
    transaction.set(ratingDocRef, ratingData, { merge: true });
    transaction.update(jokeDocRef, {
      ratingSum: newSum,
      ratingCount: newCount,
      averageRating,
    });
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
