import { describe, expect, it } from 'vitest';

import { DEFAULT_AUTH_REDIRECT, safeRedirectPath } from '@/lib/authRedirect';

describe('safeRedirectPath', () => {
  it.each([
    ['/jokes', '/jokes'],
    ['/joke/abc', '/joke/abc'],
    ['/jokes?scope=user&q=cat#top', '/jokes?scope=user&q=cat#top'],
  ])('keeps the same-site path %s', (value, expected) => {
    expect(safeRedirectPath(value)).toBe(expected);
  });

  it.each([
    ['missing', null],
    ['empty', ''],
    ['absolute URL', 'https://evil.example/jokes'],
    ['protocol-relative URL', '//evil.example'],
    ['backslash host', '/\\evil.example'],
    ['tab inside the slashes', '/\t/evil.example'],
    ['script URL', 'javascript:alert(1)'],
    ['relative path', 'jokes'],
  ])('falls back to the default for a %s', (_name, value) => {
    expect(safeRedirectPath(value)).toBe(DEFAULT_AUTH_REDIRECT);
  });
});
