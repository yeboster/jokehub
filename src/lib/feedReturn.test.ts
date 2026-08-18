import { describe, it, expect } from 'vitest';

import { FEED_PATH, readFeedUrl, rememberFeedUrl, type StorageLike } from '@/lib/feedReturn';

/** An in-memory `StorageLike`, so these tests need no DOM. */
function memoryStorage(seed: Record<string, string> = {}): StorageLike {
  const store = new Map(Object.entries(seed));
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => { store.set(key, value); },
  };
}

describe('rememberFeedUrl / readFeedUrl', () => {
  it('round-trips the plain feed', () => {
    const storage = memoryStorage();

    rememberFeedUrl(storage, '/jokes');

    expect(readFeedUrl(storage)).toBe('/jokes');
  });

  it('round-trips a filtered feed URL query and all', () => {
    const storage = memoryStorage();

    rememberFeedUrl(storage, '/jokes?scope=user&categories=Puns');

    expect(readFeedUrl(storage)).toBe('/jokes?scope=user&categories=Puns');
  });

  it('refuses to remember a URL that is not the feed', () => {
    const storage = memoryStorage();

    rememberFeedUrl(storage, '/add-joke');

    expect(readFeedUrl(storage)).toBe(FEED_PATH);
  });

  it('refuses a stored protocol-relative URL', () => {
    // Anything could have put this in storage, so the read side validates too.
    const storage = memoryStorage({ 'jokehub:last-feed-url': '//evil.example' });

    expect(readFeedUrl(storage)).toBe(FEED_PATH);
  });

  it('refuses a stored absolute URL that merely ends in the feed path', () => {
    const storage = memoryStorage({ 'jokehub:last-feed-url': 'https://evil.example/jokes' });

    expect(readFeedUrl(storage)).toBe(FEED_PATH);
  });

  it('refuses a stored path that only starts with the feed path', () => {
    const storage = memoryStorage({ 'jokehub:last-feed-url': '/jokes-evil?x=1' });

    expect(readFeedUrl(storage)).toBe(FEED_PATH);
  });

  it('falls back to the feed with nothing stored', () => {
    expect(readFeedUrl(memoryStorage())).toBe(FEED_PATH);
  });

  it('falls back to the feed when there is no storage at all', () => {
    expect(readFeedUrl(undefined)).toBe(FEED_PATH);
    expect(() => rememberFeedUrl(undefined, '/jokes')).not.toThrow();
  });

  it('swallows a setItem that throws', () => {
    // Safari private mode and quota failures.
    const storage: StorageLike = {
      getItem: () => null,
      setItem: () => { throw new Error('QuotaExceededError'); },
    };

    expect(() => rememberFeedUrl(storage, '/jokes?search=pun')).not.toThrow();
  });

  it('falls back to the feed when getItem throws', () => {
    const storage: StorageLike = {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => {},
    };

    expect(readFeedUrl(storage)).toBe(FEED_PATH);
  });
});
