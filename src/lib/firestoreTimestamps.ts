import { Timestamp } from 'firebase/firestore';

/**
 * Maps a Firestore timestamp field to a `Date`, tolerating documents where the
 * field is missing or not a `Timestamp` — a `FieldValue.serverTimestamp()`
 * write that hasn't resolved yet, a migration-written doc, or a hand-edited
 * one. An unchecked `(value as Timestamp).toDate()` throws on those and takes
 * down the whole list; the epoch fallback degrades to one bad card instead.
 */
export function toDate(value: unknown): Date {
  return value instanceof Timestamp ? value.toDate() : new Date(0);
}

/**
 * Same tolerance as {@link toDate}, for sort comparators that need epoch
 * millis. A doc missing the field sorts as the epoch instead of throwing and
 * rejecting the whole query.
 */
export function toMillis(value: unknown): number {
  return value instanceof Timestamp ? value.toMillis() : 0;
}
