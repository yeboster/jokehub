
import {
  collection,
  addDoc,
  updateDoc,
  query,
  where,
  limit,
  getDocs,
  Timestamp,
  orderBy,
  doc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { UserRating } from '@/lib/types';

const JOKE_RATINGS_COLLECTION = 'jokeRatings';

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
  const q = query(
    ratingsCollectionRef,
    where('jokeId', '==', jokeId),
    where('userId', '==', userId),
    limit(1) // Ensure we only get one doc if it exists
  );

  const querySnapshot = await getDocs(q);
  const now = Timestamp.now();
  
  // Base data, ensure comment is explicitly null if not provided or empty
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accepted constraint: dynamic Firestore payload built from optional comment + user fields; unknown would force per-property assertions.
  const ratingData: any = {
    jokeId,
    userId,
    stars,
    updatedAt: now,
    comment: (comment && comment.trim() !== '') ? comment.trim() : null,
  };


  if (!querySnapshot.empty) {
    const existingRatingDocRef = querySnapshot.docs[0].ref;
    await updateDoc(existingRatingDocRef, ratingData);
  } else {
    ratingData.createdAt = now;
    await addDoc(ratingsCollectionRef, ratingData);
  }

  // After submitting the rating, update the joke's average rating and count
  const allRatings = await fetchAllRatingsForJoke(jokeId);
  const ratingCount = allRatings.length;
  const averageRating = ratingCount > 0 
    ? Math.round((allRatings.reduce((acc, r) => acc + r.stars, 0) / ratingCount) * 10) / 10 
    : 0;

  const jokeDocRef = doc(db, 'jokes', jokeId);
  await updateDoc(jokeDocRef, {
    averageRating,
    ratingCount,
  });
}

export async function getUserRatingForJoke(
  jokeId: string,
  userId: string
): Promise<UserRating | null> {
  const ratingsCollectionRef = collection(db, JOKE_RATINGS_COLLECTION);
  const q = query(
    ratingsCollectionRef,
    where('jokeId', '==', jokeId),
    where('userId', '==', userId),
    limit(1)
  );

  try {
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      const docData = querySnapshot.docs[0].data();
      return {
        id: querySnapshot.docs[0].id,
        ...docData,
        createdAt: (docData.createdAt as Timestamp).toDate(),
        updatedAt: (docData.updatedAt as Timestamp).toDate(),
      } as UserRating; // Cast to ensure type correctness
    }
    return null;
  } catch (error) {
      console.error("Error fetching user's rating for joke:", error);
      // Depending on how you want to handle errors, you might throw or return null
      // For now, returning null and logging error.
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
    const ratings = querySnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: (data.createdAt as Timestamp).toDate(),
        updatedAt: (data.updatedAt as Timestamp).toDate(),
      } as UserRating;
    });
    return ratings;
  } catch (error) {
    console.error("Error fetching all ratings for joke:", error);
    // Consider re-throwing or returning an empty array based on error handling strategy
    throw new Error(`Failed to fetch ratings for joke ${jokeId}.`);
  }
}
