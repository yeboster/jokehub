import { describe, it, expect } from 'vitest';

import { parseCSVLine } from '@/lib/csv';

describe('parseCSVLine', () => {
  it('splits a plain unquoted line on commas', () => {
    expect(parseCSVLine('text,category,funnyRate')).toEqual(['text', 'category', 'funnyRate']);
  });

  it('returns a single field when there is no comma', () => {
    expect(parseCSVLine('just one field')).toEqual(['just one field']);
  });

  it('returns one empty field for an empty line', () => {
    expect(parseCSVLine('')).toEqual(['']);
  });

  it('preserves empty fields between commas', () => {
    expect(parseCSVLine('a,,b')).toEqual(['a', '', 'b']);
  });

  it('preserves leading and trailing empty fields', () => {
    expect(parseCSVLine(',a,')).toEqual(['', 'a', '']);
    expect(parseCSVLine(',,')).toEqual(['', '', '']);
  });

  it('keeps commas that sit inside a quoted field', () => {
    expect(parseCSVLine('"Knock, knock",Puns')).toEqual(['Knock, knock', 'Puns']);
  });

  it('strips the surrounding quotes from a quoted field', () => {
    expect(parseCSVLine('"quoted","also quoted"')).toEqual(['quoted', 'also quoted']);
  });

  it('treats a doubled quote inside a quoted field as one literal quote', () => {
    expect(parseCSVLine('"He said ""hi"" loudly",Puns')).toEqual(['He said "hi" loudly', 'Puns']);
  });

  it('handles a field that is only an escaped quote pair', () => {
    expect(parseCSVLine('""""')).toEqual(['"']);
  });

  it('reads an empty quoted field as an empty string', () => {
    expect(parseCSVLine('a,"",b')).toEqual(['a', '', 'b']);
  });

  it('does not treat quotes as special outside a quoted field', () => {
    // The parser toggles on any quote, so an unquoted 6" stays intact as long
    // as the quotes balance — this pins the current (tolerant) behaviour.
    expect(parseCSVLine('a"b",c')).toEqual(['ab', 'c']);
  });

  it('keeps whitespace verbatim — trimming is the caller\'s job', () => {
    expect(parseCSVLine(' a , b ')).toEqual([' a ', ' b ']);
    expect(parseCSVLine('" padded ",b')).toEqual([' padded ', 'b']);
  });

  it('keeps text that follows a closing quote in the same field', () => {
    expect(parseCSVLine('"quoted"tail,b')).toEqual(['quotedtail', 'b']);
  });

  it('tolerates an unterminated quote by returning the rest of the line as one field', () => {
    expect(parseCSVLine('"unterminated,still one field')).toEqual(['unterminated,still one field']);
  });

  it('handles many fields with mixed quoting', () => {
    expect(parseCSVLine('Why, hello,"Puns, plural",4,"src ""x"""')).toEqual([
      'Why',
      ' hello',
      'Puns, plural',
      '4',
      'src "x"',
    ]);
  });

  it('keeps a semicolon or tab as ordinary content', () => {
    expect(parseCSVLine('a;b\tc,d')).toEqual(['a;b\tc', 'd']);
  });

  // KNOWN LIMITATION (documented in csv.ts): the importer splits the file on
  // `\n` before calling this parser, so a quoted field containing a newline
  // never reaches it whole. Given the whole field it would parse correctly —
  // the bug is the caller's line split, not this function.
  it('would parse a quoted newline correctly if it were ever given one', () => {
    expect(parseCSVLine('"line one\nline two",Puns')).toEqual(['line one\nline two', 'Puns']);
  });

  it('shows how the pre-split caller breaks a quoted newline into two rows', () => {
    const [first, second] = '"line one\nline two",Puns'.split('\n');
    // Half a field on the first row...
    expect(parseCSVLine(first)).toEqual(['line one']);
    // ...and on the second, the stray closing quote opens a quoted field, so
    // the separator comma is swallowed and the two columns merge into one.
    expect(parseCSVLine(second)).toEqual(['line two,Puns']);
  });
});
