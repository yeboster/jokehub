
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
import {
  ANY_RATING,
  communityRatingBucket,
  isUnratedBucket,
  matchesCommunityRatingBucket,
} from '@/lib/ratingBuckets';
import { shouldDegradeRatingFilter } from '@/lib/ratingFilterDegrade';
import { toDate, toMillis } from '@/lib/firestoreTimestamps';

const JOKES_COLLECTION = 'jokes';
const JOKE_RATINGS_COLLECTION = 'jokeRatings';
/**
 * One page of the feed. Twelve, not ten: the grid is 1/2/3/4 columns
 * (`joke-list.tsx`), and ten leaves a ragged last row at every breakpoint above
 * one (4+4+2, 3+3+3+1) while twelve divides evenly by all four. It also cuts a
 * 200-joke collection from twenty "Load More" presses to seventeen.
 */
const PAGE_SIZE = 12;
/** Firestore's hard limit on writes in a single batch. */
const MAX_BATCH_WRITES = 500;
/**
 * How many pages a single `fetchJokes` call will pull through while looking for
 * one that survives the client-side token AND (see `fetchJokes`). Bounded so a
 * search whose first token is common but whose full term is rare can't turn one
 * call into a scan of the whole collection.
 */
const MAX_SEARCH_PAGES = 5;

export interface FilterParams {
  selectedCategories: string[];
  /**
   * The community-rating band: -1 for any, 0 for unrated, 1-5 for a band of
   * the joke's `averageRating`. The name and the `funnyRate` query parameter
   * predate the fix that moved it off the author's own score; the URL form is
   * kept so existing feed links keep working.
   */
  filterFunnyRate: number;
  usageStatus: 'all' | 'used' | 'unused';
  scope: 'public' | 'user';
  search: string;
  /** Max jokes to fetch per page. Defaults to PAGE_SIZE. */
  limit?: number;
}

/** Exported for tests; callers outside this module go through `fetchJokes`. */
export function buildJokesQuery(
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
  // client-side in `fetchJokesPage` (AND semantics — every token must be
  // present), which is why `fetchJokes` may need more than one page.
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

  // The rating filter reads the community average the cards display, which
  // `submitUserRating` maintains on the joke doc, and not `funnyRate` — the
  // author's own score, which nothing but the edit form writes. A picker value
  // becomes a band (see `ratingBuckets.ts`): the average is a mean rounded to
  // one decimal, so equality would miss the 4.8s and 4.9s that are exactly
  // what a user asking for five stars wants.
  //
  // Two consequences worth knowing about, both accepted here:
  //   - a range filter makes Firestore order by that field before the explicit
  //     ordering, so inside a band the page is grouped by average and only
  //     then by date. The band's contents are right; "newest first" holds
  //     within one average, not across the whole band.
  //   - the composite index for a band plus the date ordering is a new
  //     combination and is not deployed yet, which is what `fetchJokesPage`'s
  //     degrade path exists for.
  const ratingBucket = communityRatingBucket(filters.filterFunnyRate);
  if (ratingBucket) {
    if (isUnratedBucket(ratingBucket)) {
      // Nobody has rated it. A count of zero, never a range: an unrated joke
      // has no average to compare against.
      queryConstraints.push(where('ratingCount', '==', 0));
    } else {
      queryConstraints.push(where('averageRating', '>=', ratingBucket.gte));
      if (ratingBucket.lt !== undefined) {
        queryConstraints.push(where('averageRating', '<', ratingBucket.lt));
      }
    }
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

/**
 * The page a missing index leaves us able to fetch, in order of preference.
 *
 * `dropRatingConstraint` is the rating-band degrade: the band goes out of the
 * query and the date ordering stays, because the remaining constraints are the
 * combinations the feed has always used and their indexes exist. If even that
 * finds no index, the ordering goes too — the fallback this path has always
 * had, since equality-only filters need no composite index — and the caller
 * sorts client-side. `null` means the query could not be built at all (user
 * scope with no signed-in user), which is an empty page and not an error.
 */
async function fetchFallbackPage(
  filters: FilterParams,
  dropRatingConstraint: boolean,
  userId?: string,
  lastVisibleJokeDoc?: QueryDocumentSnapshot | null
): Promise<{ docs: QueryDocumentSnapshot[]; sortClientSide: boolean } | null> {
  const fallbackFilters = dropRatingConstraint
    ? { ...filters, filterFunnyRate: ANY_RATING }
    : filters;
  const orderings = dropRatingConstraint ? [true, false] : [false];

  for (let attempt = 0; attempt < orderings.length; attempt++) {
    const orderByDateAdded = orderings[attempt];
    const fallbackQuery = buildJokesQuery(fallbackFilters, userId, lastVisibleJokeDoc, {
      orderByDateAdded,
    });
    if (!fallbackQuery) {
      return null;
    }
    try {
      return { docs: (await getDocs(fallbackQuery)).docs, sortClientSide: !orderByDateAdded };
    } catch (error) {
      // The last attempt's failure is the caller's, and so is anything that is
      // not a missing index.
      if (attempt === orderings.length - 1 || !isMissingIndexError(error)) {
        throw error;
      }
      warnMissingIndex('fetchJokes', error);
    }
  }

  return null;
}

/** One page of the query built by `buildJokesQuery`, narrowed by the tokens the query itself couldn't express. */
async function fetchJokesPage(
  filters: FilterParams,
  searchTokens: string[],
  userId?: string,
  lastVisibleJokeDoc?: QueryDocumentSnapshot | null
) {
  const emptyPage = { jokes: [], lastVisible: null, hasMore: false, ratingFilterDegraded: false };
  const q = buildJokesQuery(filters, userId, lastVisibleJokeDoc);
  if (!q) {
    return emptyPage;
  }

  let docs: QueryDocumentSnapshot[];
  let sortClientSide = false;
  let ratingFilterDegraded = false;
  try {
    docs = (await getDocs(q)).docs;
  } catch (error) {
    if (!isMissingIndexError(error)) {
      throw error;
    }
    warnMissingIndex('fetchJokes', error);
    // The composite index for this filter combination is missing/building.
    // Either the rating band comes out of the query and is applied below to
    // whatever this page returned, or — for every other combination — the
    // orderBy is dropped and the page is sorted client-side. Pagination
    // survives both: without an orderBy the query is implicitly ordered by
    // document id, so the startAfter cursor still keeps pages disjoint, and
    // the global date ordering is the only casualty.
    ratingFilterDegraded = shouldDegradeRatingFilter(error, filters);
    const fallback = await fetchFallbackPage(
      filters,
      ratingFilterDegraded,
      userId,
      lastVisibleJokeDoc
    );
    if (!fallback) {
      return { ...emptyPage, ratingFilterDegraded };
    }
    docs = fallback.docs;
    sortClientSide = fallback.sortClientSide;
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
    // back partly (or entirely) filtered out — `hasMore` and the cursor below
    // stay based on the raw docs, so pagination itself remains correct, and
    // `fetchJokes` pages on when this leaves nothing.
    jokes = jokes.filter((joke) => searchTokens.every((token) => joke.keywords?.includes(token)));
  }

  if (ratingFilterDegraded) {
    // The band the query could not carry, applied to the documents this page
    // did return. Pagination here is APPROXIMATE and deliberately so: the
    // cursor and `hasMore` below stay based on the raw docs — they have to, or
    // pages would overlap — so a page can come back short, or empty with more
    // behind it. `fetchJokes` pages on through a bounded number of empty pages
    // for exactly this reason. A feed that shows fewer jokes per press beats a
    // feed that shows an error until somebody deploys an index.
    const bucket = communityRatingBucket(filters.filterFunnyRate);
    if (bucket) {
      jokes = jokes.filter((joke) => matchesCommunityRatingBucket(bucket, joke));
    }
  }

  if (sortClientSide) {
    jokes.sort((a, b) => b.dateAdded.getTime() - a.dateAdded.getTime());
  }

  // Taken from the raw (query-ordered) docs, not the client-sorted jokes, so
  // the cursor stays consistent with the query that produced it.
  const lastVisible = docs[docs.length - 1] ?? null;
  const hasMore = docs.length === (filters.limit ?? PAGE_SIZE);

  return { jokes, lastVisible, hasMore, ratingFilterDegraded };
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
    return { jokes: [], lastVisible: null, hasMore: false, ratingFilterDegraded: false };
  }

  // Only the first token constrains the query, so for a multi-word term the
  // client-side AND can empty a whole page while later pages still hold
  // matches. Page on in that case: an empty result then means "nothing left to
  // match" rather than "nothing on this page", which is what the caller's empty
  // state claims. Pages that yielded nothing contribute nothing, so the last
  // page fetched is the whole answer — and its cursor/`hasMore` are the ones
  // "load more" must continue from. A single-token (or no) search never loops:
  // an empty page there already means the query itself was exhausted.
  //
  // A page whose rating band was applied client-side can empty the same way,
  // and pages on for the same reason and under the same bound.
  let page = await fetchJokesPage(filters, searchTokens, userId, lastVisibleJokeDoc);
  let ratingFilterDegraded = page.ratingFilterDegraded;
  for (
    let extraPages = 0;
    page.jokes.length === 0 && page.hasMore && extraPages < MAX_SEARCH_PAGES;
    extraPages++
  ) {
    page = await fetchJokesPage(filters, searchTokens, userId, page.lastVisible);
    // Sticky across the pages this call pulled through: the notice is about
    // the fetch as a whole, and a later page that happened not to degrade does
    // not undo an earlier one that did.
    ratingFilterDegraded = ratingFilterDegraded || page.ratingFilterDegraded;
  }

  return { ...page, ratingFilterDegraded };
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
  const categoriesToEnsure = new Set<string>();
  importedJokesData.forEach((joke) => categoriesToEnsure.add(joke.category.trim()));

  for (const catName of categoriesToEnsure) {
    if (catName) await ensureCategoryExists(catName, userId);
  }

  const jokesToWrite = importedJokesData.filter((jokeData) => {
    if (jokeData.category.trim()) return true;
    console.warn('Skipping joke with empty category:', jokeData.text);
    return false;
  });

  // Commit in chunks — a Firestore write batch accepts at most 500 writes, and
  // an import of more than 500 rows would otherwise be rejected wholesale.
  // Chunks commit independently, so a failure part-way through leaves the
  // earlier chunks written; the error says how many made it so the caller can
  // report something truthful rather than "all or nothing".
  let written = 0;
  for (let i = 0; i < jokesToWrite.length; i += MAX_BATCH_WRITES) {
    const chunk = jokesToWrite.slice(i, i + MAX_BATCH_WRITES);
    const batch = writeBatch(db);
    for (const jokeData of chunk) {
      const docRef = doc(collection(db, JOKES_COLLECTION));
      batch.set(docRef, {
        ...jokeData,
        category: jokeData.category.trim(),
        source: jokeData.source || '',
        funnyRate: jokeData.funnyRate ?? 0,
        dateAdded: Timestamp.now(),
        used: false,
        userId: userId,
        keywords: generateKeywords(jokeData.text),
      });
    }
    try {
      await batch.commit();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (written === 0) throw error;
      throw new Error(
        `Imported ${written} of ${jokesToWrite.length} jokes before the import failed: ${message}`
      );
    }
    written += chunk.length;
  }
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
