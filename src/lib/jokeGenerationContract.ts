export const JOKE_GENERATION_LIMITS = {
  topicHintChars: 500,
  contextTextChars: 2000,
  prefilledJokes: 25,
  exemplarJokes: 25,
  recentGeneratedJokes: 12,
  avoidJokes: 8,
  libraryJokes: 1000,
} as const;

/** `classic` asks for proven, already-existing jokes instead of new ones. */
export const JOKE_MODES = ['original', 'classic'] as const;
export type JokeMode = (typeof JOKE_MODES)[number];

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

const STOPWORDS = new Set(('a an the is are was were be been to of and or in on at for from with it its they theyre them their ' +
  'he hes she his her you your i im my me we our do does did dont doesnt didnt why what how who when where because ' +
  'that this so just never ever not no can cant will would').split(' '));
const NEAR_DUPLICATE_MIN_WORDS = 3;
const NEAR_DUPLICATE_SIMILARITY = 0.6;

/** Same joke reworded: content-word overlap, so retold classics match the user's saved copy. */
export function isNearDuplicateJoke(a: string, b: string): boolean {
  const aKey = normalizeJokeKey(a);
  const bKey = normalizeJokeKey(b);
  if (!aKey || !bKey) return false;
  if (aKey === bKey) return true;
  const words = (key: string) => new Set(key.split(' ').filter(word => !STOPWORDS.has(word)));
  const aWords = words(aKey);
  const bWords = words(bKey);
  if (aWords.size < NEAR_DUPLICATE_MIN_WORDS || bWords.size < NEAR_DUPLICATE_MIN_WORDS) return false;
  const shared = [...aWords].filter(word => bWords.has(word)).length;
  return shared / (aWords.size + bWords.size - shared) >= NEAR_DUPLICATE_SIMILARITY;
}
