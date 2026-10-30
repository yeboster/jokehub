import { normalizeJokeKey } from '@/lib/jokeGenerationContract';

export type JokeLintIssue = 'too-long' | 'exclamation' | 'marked-pun' | 'trailing-explanation';

export const MAX_JOKE_WORDS = 20;
/** Words allowed after the hinge before it reads as an explanation ("…, of course"). */
const MAX_WORDS_AFTER_HINGE = 3;

// Single quotes or asterisks around one to three words, e.g. 're-cycle' or *hard drive*.
// Double quotes are left alone: the user's favorites use them for dialogue.
const SINGLE_QUOTED = /(?:^|[\s(])['‘]([^'‘’\n]{1,40}?)['’](?=[\s.,!?;:)]|$)/gu;
const ASTERISKED = /\*([^*\n]{1,40}?)\*/gu;

function wordCount(text: string): number {
  return text.split(/\s+/u).filter(token => /[\p{L}\p{N}]/u.test(token)).length;
}

function hasMarkedPun(text: string): boolean {
  return [...text.matchAll(SINGLE_QUOTED), ...text.matchAll(ASTERISKED)]
    .some(match => wordCount(match[1]) >= 1 && wordCount(match[1]) <= 3);
}

function wordsAfterHinge(text: string, hinge: string): number | null {
  const key = normalizeJokeKey(hinge);
  if (!key) return null;
  const padded = ` ${normalizeJokeKey(text)} `;
  const at = padded.lastIndexOf(` ${key} `);
  return at === -1 ? null : wordCount(padded.slice(at + key.length + 2));
}

/** Cheap deterministic checks for habits the user rates low; issues are ordered and unique. */
export function lintJoke(text: string, hinge?: string): JokeLintIssue[] {
  const issues: JokeLintIssue[] = [];
  if (wordCount(text) > MAX_JOKE_WORDS) issues.push('too-long');
  if (/[!！]/u.test(text)) issues.push('exclamation');
  if (hasMarkedPun(text)) issues.push('marked-pun');
  const after = hinge ? wordsAfterHinge(text, hinge) : null;
  if (after !== null && after > MAX_WORDS_AFTER_HINGE) issues.push('trailing-explanation');
  return issues;
}
