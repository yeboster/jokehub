import { describe, it, expect } from 'vitest';

import { copyToClipboard, jokeShareUrl, type ClipboardLike } from '@/lib/share';

describe('jokeShareUrl', () => {
  it('builds the canonical joke URL from an origin and an id', () => {
    expect(jokeShareUrl('https://jokehub.app', 'abc')).toBe('https://jokehub.app/joke/abc');
  });

  it('does not double the slash when the origin ends in one', () => {
    expect(jokeShareUrl('https://jokehub.app/', 'abc')).toBe('https://jokehub.app/joke/abc');
  });

  it('strips a run of trailing slashes', () => {
    expect(jokeShareUrl('https://jokehub.app///', 'abc')).toBe('https://jokehub.app/joke/abc');
  });

  it('percent-encodes an id that needs escaping', () => {
    expect(jokeShareUrl('https://jokehub.app', 'a b/c?d')).toBe(
      'https://jokehub.app/joke/a%20b%2Fc%3Fd'
    );
  });

  it('keeps a port and a non-https scheme, which is the local-development case', () => {
    expect(jokeShareUrl('http://localhost:3000', 'xyz')).toBe('http://localhost:3000/joke/xyz');
  });
});

describe('copyToClipboard', () => {
  it('returns true and passes the exact text through to the clipboard', async () => {
    const written: string[] = [];
    const clipboard: ClipboardLike = {
      writeText: async (text) => {
        written.push(text);
      },
    };

    await expect(copyToClipboard('https://jokehub.app/joke/abc', clipboard)).resolves.toBe(true);
    expect(written).toEqual(['https://jokehub.app/joke/abc']);
  });

  it('returns false when the clipboard rejects — a denied permission, or an unfocused document', async () => {
    const clipboard: ClipboardLike = {
      writeText: async () => {
        throw new Error('NotAllowedError');
      },
    };

    await expect(copyToClipboard('anything', clipboard)).resolves.toBe(false);
  });

  it('returns false rather than throwing when there is no clipboard at all (insecure origin)', async () => {
    await expect(copyToClipboard('anything')).resolves.toBe(false);
    await expect(copyToClipboard('anything', undefined)).resolves.toBe(false);
  });
});
