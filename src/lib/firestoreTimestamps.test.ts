import { describe, it, expect } from 'vitest';
import { Timestamp } from 'firebase/firestore';

import { toDate, toMillis } from '@/lib/firestoreTimestamps';

const EPOCH = new Date(0);

describe('toDate', () => {
  it('converts a Firestore Timestamp', () => {
    const when = new Date('2026-08-17T12:34:56.000Z');
    expect(toDate(Timestamp.fromDate(when))).toEqual(when);
  });

  it('preserves sub-second precision', () => {
    const when = new Date('2026-08-17T12:34:56.789Z');
    expect(toDate(Timestamp.fromDate(when)).getTime()).toBe(when.getTime());
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a serverTimestamp sentinel placeholder', {}],
    // A doc read back before the sentinel resolves, or one written by a
    // migration, can carry the raw shape instead of a real Timestamp.
    ['a plain {seconds, nanoseconds} object', { seconds: 1700000000, nanoseconds: 0 }],
    ['an ISO string', '2026-08-17T12:34:56.000Z'],
    ['a number of millis', 1700000000000],
    ['a Date', new Date('2026-08-17T12:34:56.000Z')],
  ])('falls back to the epoch for %s instead of throwing', (_label, value) => {
    expect(toDate(value)).toEqual(EPOCH);
  });

  it('always returns a usable Date, so list rendering cannot be taken down by one bad doc', () => {
    expect(toDate(undefined).getTime()).toBe(0);
    expect(Number.isNaN(toDate('garbage').getTime())).toBe(false);
  });
});

describe('toMillis', () => {
  it('converts a Firestore Timestamp to epoch millis', () => {
    const when = new Date('2026-08-17T12:34:56.789Z');
    expect(toMillis(Timestamp.fromDate(when))).toBe(when.getTime());
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a plain {seconds, nanoseconds} object', { seconds: 1700000000, nanoseconds: 0 }],
    ['a Date', new Date('2026-08-17T12:34:56.000Z')],
  ])('returns 0 for %s', (_label, value) => {
    expect(toMillis(value)).toBe(0);
  });

  it('sorts a mix of valid and missing timestamps oldest-last without throwing', () => {
    const older = Timestamp.fromDate(new Date('2020-01-01T00:00:00.000Z'));
    const newer = Timestamp.fromDate(new Date('2026-01-01T00:00:00.000Z'));
    const docs: unknown[] = [older, undefined, newer];
    const sorted = [...docs].sort((a, b) => toMillis(b) - toMillis(a));
    expect(sorted).toEqual([newer, older, undefined]);
  });
});
