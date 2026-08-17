/**
 * Derives lowercase, punctuation-stripped, length>2 unique keywords from a piece of text.
 * Used both by the client-side jokeService and the /api/jokes/add route.
 */
export function generateKeywords(text: string): string[] {
  const words = text
    .toLowerCase()
    .split(/\s+/)
    .map(word => word.replace(/[.,!?;:()"'`]/g, ''))
    .filter(word => word.length > 2);
  return Array.from(new Set(words)); // Return unique keywords
}

/** Upper bound on the tokens a single search term is split into. */
export const MAX_SEARCH_TOKENS = 10;

/**
 * Tokenizes a user's search term the same way stored keywords are generated,
 * so the two can actually match: lowercased, punctuation stripped, words of
 * three or more characters only.
 *
 * A term that tokenizes to nothing (`"an"`, `"?"`) can never match a stored
 * keyword — callers should treat an empty result for a non-empty term as
 * "no matches" rather than "no search".
 */
export function generateSearchTokens(search: string): string[] {
  return generateKeywords(search).slice(0, MAX_SEARCH_TOKENS);
}
