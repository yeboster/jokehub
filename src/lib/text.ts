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
