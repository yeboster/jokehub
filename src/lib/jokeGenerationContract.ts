export const JOKE_GENERATION_LIMITS = {
  topicHintChars: 500,
  contextTextChars: 2000,
  prefilledJokes: 25,
  exemplarJokes: 10,
  recentGeneratedJokes: 12,
} as const;

/** Deterministic textual equivalence only; not semantic duplicate detection. */
export function normalizeJokeKey(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

/** Preserve original text and first occurrence; callers validate input bounds. */
export function mergeUniqueJokeTexts(
  primary: readonly string[],
  secondary: readonly string[],
  cap: number,
): string[] {
  const result: string[] = [];
  const keys = new Set<string>();
  for (const text of [...primary, ...secondary]) {
    if (result.length >= cap) break;
    const key = normalizeJokeKey(text);
    if (!key || keys.has(key)) continue;
    keys.add(key);
    result.push(text);
  }
  return result;
}
