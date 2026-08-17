
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  query,
  orderBy,
  Timestamp,
  writeBatch,
  where,
  limit,
  getDocs,
  getDoc,
  startAfter,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Joke } from '@/lib/types';
import { ensureCategoryExists } from './categoryService';
import { generateKeywords, generateSearchTokens } from '@/lib/text';
import { isMissingIndexError, warnMissingIndex } from '@/lib/firestoreErrors';
import { toDate, toMillis } from '@/lib/firestoreTimestamps';

const JOKES_COLLECTION = 'jokes';
const JOKE_RATINGS_COLLECTION = 'jokeRatings';
const PAGE_SIZE = 10;
/** Firestore's hard limit on writes in a single batch. */
const MAX_BATCH_WRITES = 500;

export interface FilterParams {
  selectedCategories: string[];
  filterFunnyRate: number;
  usageStatus: 'all' | 'used' | 'unused';
  scope: 'public' | 'user';
  search: string;
  /** Max jokes to fetch per page. Defaults to PAGE_SIZE. */
  limit?: number;
}

function buildJokesQuery(
  filters: FilterParams,
  userId?: string,
  lastVisibleJokeDoc?: QueryDocumentSnapshot | null,
  options: { orderByDateAdded?: boolean } = {}
) {
  const { orderByDateAdded = true } = options;

  if (filters.scope === 'user' && !userId) {
    return null;
  }

  const queryConstraints = [];

  if (filters.scope === 'user' && userId) {
    queryConstraints.push(where('userId', '==', userId));
  }

  // Search strategy — first token in the query, the rest client-side:
  //
  // Stored `keywords` are single punctuation-stripped words, so the raw search
  // term was unmatchable as soon as it contained a space or punctuation. We
  // tokenize the term the same way the keywords were generated and constrain
  // the query on the FIRST token only, then intersect the remaining tokens
  // client-side in `fetchJokes` (AND semantics — every token must be present).
  //
  // `array-contains-any` over all tokens was the alternative, but it is a
  // disjunction: combined with the `category in [...]` clause below, Firestore
  // expands the query to tokens × categories disjuncts and rejects anything
  // over 30. It would also read strictly more documents than the first token
  // alone, since the client-side pass narrows OR back down to AND either way.
  const searchTokens = generateSearchTokens(filters.search);
  if (searchTokens.length > 0) {
    queryConstraints.push(where('keywords', 'array-contains', searchTokens[0]));
  }

  if (filters.selectedCategories.length > 0) {
    queryConstraints.push(where('category', 'in', filters.selectedCategories.slice(0, 30)));
  }

  if (filters.filterFunnyRate !== -1) {
    queryConstraints.push(where('funnyRate', '==', filters.filterFunnyRate));
  }

  if (filters.usageStatus === 'used') {
    queryConstraints.push(where('used', '==', true));
  } else if (filters.usageStatus === 'unused') {
    queryConstraints.push(where('used', '==', false));
  }

  if (orderByDateAdded) {
    queryConstraints.push(orderBy('dateAdded', 'desc'));
  }

  if (lastVisibleJokeDoc) {
    queryConstraints.push(startAfter(lastVisibleJokeDoc));
  }

  queryConstraints.push(limit(filters.limit ?? PAGE_SIZE));

  return query(collection(db, JOKES_COLLECTION), ...queryConstraints);
}

export async function fetchJokes(
  filters: FilterParams,
  userId?: string,
  lastVisibleJokeDoc?: QueryDocumentSnapshot | null
) {
  const searchTokens = generateSearchTokens(filters.search);
  if (filters.search.trim() !== '' && searchTokens.length === 0) {
    // Every word in the term was punctuation or shorter than three characters,
    // so no stored keyword can match it. Skip the round trip.
    return { jokes: [], lastVisible: null, hasMore: false };
  }

  const q = buildJokesQuery(filters, userId, lastVisibleJokeDoc);
  if (!q) {
    return { jokes: [], lastVisible: null, hasMore: false };
  }

  let docs: QueryDocumentSnapshot[];
  let sortClientSide = false;
  try {
    docs = (await getDocs(q)).docs;
  } catch (error) {
    if (!isMissingIndexError(error)) {
      throw error;
    }
    warnMissingIndex('fetchJokes', error);
    // The composite index for this filter combination is missing/building —
    // drop the orderBy (equality-only filters need no composite index) and
    // sort client-side instead. Pagination still works: without an orderBy the
    // query is implicitly ordered by document id, so the startAfter cursor
    // keeps pages disjoint, but the global date ordering is only per page.
    const fallbackQuery = buildJokesQuery(filters, userId, lastVisibleJokeDoc, {
      orderByDateAdded: false,
    });
    if (!fallbackQuery) {
      return { jokes: [], lastVisible: null, hasMore: false };
    }
    docs = (await getDocs(fallbackQuery)).docs;
    sortClientSide = true;
  }

  let jokes = docs.map(
    (docSnapshot) =>
      ({
        id: docSnapshot.id,
        ...docSnapshot.data(),
        dateAdded: toDate(docSnapshot.data().dateAdded),
      } as Joke)
  );

  if (searchTokens.length > 1) {
    // The query matched the first token; require the rest too. A page can come
    // back partly filtered out — `hasMore` and the cursor below stay based on
    // the raw docs, so pagination itself remains correct.
    jokes = jokes.filter((joke) => searchTokens.every((token) => joke.keywords?.includes(token)));
  }

  if (sortClientSide) {
    jokes.sort((a, b) => b.dateAdded.getTime() - a.dateAdded.getTime());
  }

  // Taken from the raw (query-ordered) docs, not the client-sorted jokes, so
  // the cursor stays consistent with the query that produced it.
  const lastVisible = docs[docs.length - 1] ?? null;
  const hasMore = docs.length === (filters.limit ?? PAGE_SIZE);

  return { jokes, lastVisible, hasMore };
}

export async function addJoke(
  newJokeData: { text: string; category: string; source?: string, funnyRate?: number },
  userId: string
) {
  const finalCategoryName = await ensureCategoryExists(newJokeData.category, userId);
  await addDoc(collection(db, JOKES_COLLECTION), {
    ...newJokeData,
    category: finalCategoryName,
    source: newJokeData.source || '',
    funnyRate: newJokeData.funnyRate ?? 0,
    dateAdded: Timestamp.now(),
    used: false,
    userId: userId,
    keywords: generateKeywords(newJokeData.text),
  });
}

export async function importJokes(
  importedJokesData: Omit<Joke, 'id' | 'used' | 'dateAdded' | 'userId'>[],
  userId: string
) {
  const batch = writeBatch(db);
  const categoriesToEnsure = new Set<string>();
  importedJokesData.forEach((joke) => categoriesToEnsure.add(joke.category.trim()));

  for (const catName of categoriesToEnsure) {
    if (catName) await ensureCategoryExists(catName, userId);
  }

  for (const jokeData of importedJokesData) {
    const finalCategoryName = jokeData.category.trim();
    if (!finalCategoryName) {
      console.warn('Skipping joke with empty category:', jokeData.text);
      continue;
    }
    const docRef = doc(collection(db, JOKES_COLLECTION));
    batch.set(docRef, {
      ...jokeData,
      category: finalCategoryName,
      source: jokeData.source || '',
      funnyRate: jokeData.funnyRate ?? 0,
      dateAdded: Timestamp.now(),
      used: false,
      userId: userId,
      keywords: generateKeywords(jokeData.text),
    });
  }
  await batch.commit();
}

async function getJokeDoc(jokeId: string) {
    const jokeDocRef = doc(db, JOKES_COLLECTION, jokeId);
    const docSnap = await getDoc(jokeDocRef);
    if (!docSnap.exists()) {
      throw new Error('Joke not found.');
    }
    // The snapshot is returned alongside the data so callers that need the
    // document id (e.g. `getJokeById`) don't have to re-read the doc.
    return { ref: jokeDocRef, data: docSnap.data(), snapshot: docSnap };
  }
  
  export async function toggleJokeUsed(jokeId: string, userId: string) {
    const { ref, data } = await getJokeDoc(jokeId);
    if (data.userId !== userId) {
      throw new Error('You can only update your own jokes.');
    }
    await updateDoc(ref, { used: !data.used });
  }
  
  export async function getJokeById(jokeId: string): Promise<Joke | null> {
    try {
        // `getJokeDoc` has already read the document and thrown if it's missing.
        const { data, snapshot } = await getJokeDoc(jokeId);
        return { id: snapshot.id, ...data, dateAdded: toDate(data.dateAdded) } as Joke;
    } catch (error) {
        // If getJokeDoc throws 'Joke not found', we can catch it and return null.
        if (error instanceof Error && error.message === 'Joke not found.') {
            return null;
        }
        // Re-throw other unexpected errors
        throw error;
    }
}
  
  export async function updateJoke(
    jokeId: string,
    updatedData: Partial<Omit<Joke, 'id' | 'dateAdded' | 'userId' | 'keywords'>>,
    userId: string
  ) {
    const { ref, data } = await getJokeDoc(jokeId);
    if (data.userId !== userId) {
        throw new Error('You can only update your own jokes.');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accepted constraint: build a dynamic Partial<Joke> patch keyed by string; unknown would force casts on every assignment below.
  const dataToUpdate: Record<string, any> = {};
  
    if (updatedData.category) {
      dataToUpdate.category = await ensureCategoryExists(updatedData.category, userId);
    }
    if (updatedData.text !== undefined) {
        dataToUpdate.text = updatedData.text;
        dataToUpdate.keywords = generateKeywords(updatedData.text);
        if (updatedData.text !== data.text) {
          // The stored explanation describes the old text, so it's stale. Clear
          // it so the detail page offers to explain the new text instead. An
          // explicit `updatedData.explanation` below still wins.
          dataToUpdate.explanation = '';
        }
    }
    if (updatedData.source !== undefined) dataToUpdate.source = updatedData.source;
    if (updatedData.funnyRate !== undefined) dataToUpdate.funnyRate = updatedData.funnyRate;
    if (updatedData.used !== undefined) dataToUpdate.used = updatedData.used;
    if (updatedData.explanation !== undefined) dataToUpdate.explanation = updatedData.explanation;
  
    if (Object.keys(dataToUpdate).length === 0) {
      return;
    }
  
    await updateDoc(ref, dataToUpdate);
  }

  export async function deleteJoke(jokeId: string, userId: string) {
    const { ref, data } = await getJokeDoc(jokeId);
    if (data.userId !== userId) {
      throw new Error('You can only delete your own jokes.');
    }
    
    // 1. Collect all ratings for the joke, then the joke itself. The joke goes
    // last so a failure part-way through never leaves ratings pointing at a
    // deleted joke.
    const ratingsQuery = query(collection(db, JOKE_RATINGS_COLLECTION), where('jokeId', '==', jokeId));
    const ratingsSnapshot = await getDocs(ratingsQuery);
    const refsToDelete = [...ratingsSnapshot.docs.map((ratingDoc) => ratingDoc.ref), ref];

    // 2. Commit in chunks — a Firestore write batch accepts at most 500 writes,
    // and a joke can have more than 500 ratings.
    for (let i = 0; i < refsToDelete.length; i += MAX_BATCH_WRITES) {
      const batch = writeBatch(db);
      for (const docRef of refsToDelete.slice(i, i + MAX_BATCH_WRITES)) {
        batch.delete(docRef);
      }
      await batch.commit();
    }
  }

  export async function fetchUserFiveStarJokes(userId: string): Promise<string[]> {
    const ratingsCollectionRef = collection(db, JOKE_RATINGS_COLLECTION);
    let ratingDocs;
    try {
      const ratingsQuery = query(
        ratingsCollectionRef,
        where('userId', '==', userId),
        where('stars', '==', 5),
        orderBy('updatedAt', 'desc'),
        limit(10) // Limit to the last 10 5-star jokes for performance
      );
      const ratingsSnapshot = await getDocs(ratingsQuery);
      ratingDocs = ratingsSnapshot.docs;
    } catch (error) {
      if (!isMissingIndexError(error)) {
        throw error;
      }
      warnMissingIndex('fetchUserFiveStarJokes', error);
      // Composite index (userId + stars + orderBy updatedAt) missing/building —
      // drop the orderBy (equality-only filters need no composite index) and
      // sort client-side instead.
      const fallbackQuery = query(
        ratingsCollectionRef,
        where('userId', '==', userId),
        where('stars', '==', 5)
      );
      const fallbackSnapshot = await getDocs(fallbackQuery);
      ratingDocs = fallbackSnapshot.docs
        .slice()
        .sort((a, b) => toMillis(b.data().updatedAt) - toMillis(a.data().updatedAt))
        .slice(0, 10);
    }

    if (ratingDocs.length === 0) {
      return [];
    }

    const jokeIds = ratingDocs.map(doc => doc.data().jokeId);
    
    // Firestore 'in' queries are limited to 30 items, but we're only fetching 10.
    const jokesQuery = query(collection(db, 'jokes'), where('__name__', 'in', jokeIds));
    const jokesSnapshot = await getDocs(jokesQuery);
  
    return jokesSnapshot.docs.map(doc => doc.data().text);
  }
