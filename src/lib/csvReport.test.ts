import { describe, it, expect } from 'vitest';

import { MAX_REPORTED_ROWS, describeSkippedRows, summarizeImport, type SkippedRow } from '@/lib/csvReport';

const MISSING = 'missing "text" or "category"';
const LONG_SOURCE = '"source" longer than 100 characters';

/** `count` skipped rows numbered from `first`, all with the same reason. */
function rows(count: number, first = 2, reason = MISSING): SkippedRow[] {
  return Array.from({ length: count }, (_unused, index) => ({ lineNumber: first + index, reason }));
}

describe('describeSkippedRows', () => {
  it('says "row" in the singular for one skipped row', () => {
    expect(describeSkippedRows([{ lineNumber: 4, reason: MISSING }])).toBe(`row 4 (${MISSING})`);
  });

  it('says "rows" in the plural for two skipped rows', () => {
    expect(describeSkippedRows(rows(2, 3))).toBe(`rows 3, 4 (${MISSING})`);
  });

  it('names ten row numbers and summarizes the rest', () => {
    const description = describeSkippedRows(rows(12, 1));
    expect(description).toBe(`rows 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 and 2 more (${MISSING})`);
    expect(description).not.toContain('11');
  });

  it('names every row number when there are exactly MAX_REPORTED_ROWS', () => {
    const description = describeSkippedRows(rows(MAX_REPORTED_ROWS, 1));
    expect(description).toContain(`rows 1, 2, 3, 4, 5, 6, 7, 8, 9, ${MAX_REPORTED_ROWS}`);
    expect(description).not.toContain('more');
  });

  it('de-duplicates a reason repeated across rows', () => {
    expect(describeSkippedRows(rows(3, 2))).toBe(`rows 2, 3, 4 (${MISSING})`);
  });

  it('joins distinct reasons with a semicolon', () => {
    expect(
      describeSkippedRows([
        { lineNumber: 2, reason: MISSING },
        { lineNumber: 5, reason: LONG_SOURCE },
        { lineNumber: 9, reason: MISSING },
      ])
    ).toBe(`rows 2, 5, 9 (${MISSING}; ${LONG_SOURCE})`);
  });
});

describe('summarizeImport', () => {
  it('reports a clean import of one joke in the singular', () => {
    expect(summarizeImport(1, [])).toEqual({
      title: 'Import finished',
      description: '1 joke imported.',
    });
  });

  it('reports a clean import of five jokes in the plural', () => {
    expect(summarizeImport(5, [])).toEqual({
      title: 'Import finished',
      description: '5 jokes imported.',
    });
  });

  it('names both counts and the rows for a partial import', () => {
    expect(summarizeImport(8, rows(2, 3))).toEqual({
      title: 'Some rows skipped',
      description: `8 imported, 2 skipped — rows 3, 4 (${MISSING}).`,
    });
  });

  it('titles an all-skipped import "Nothing imported" and lists the rows', () => {
    expect(summarizeImport(0, rows(3, 2))).toEqual({
      title: 'Nothing imported',
      description: `No jokes imported — all 3 rows skipped: rows 2, 3, 4 (${MISSING}).`,
    });
  });

  it('pluralizes the all-skipped sentence for a single row', () => {
    expect(summarizeImport(0, [{ lineNumber: 2, reason: MISSING }])).toEqual({
      title: 'Nothing imported',
      description: `No jokes imported — all 1 row skipped: row 2 (${MISSING}).`,
    });
  });

  it('falls back to "No valid jokes" when nothing landed and nothing was skipped', () => {
    expect(summarizeImport(0, [])).toEqual({
      title: 'Nothing imported',
      description: 'No valid jokes found in the CSV file to import.',
    });
  });

  it('keeps every title within the three-word toast convention', () => {
    const titles = [
      summarizeImport(3, []).title,
      summarizeImport(3, [{ lineNumber: 4, reason: MISSING }]).title,
      summarizeImport(0, [{ lineNumber: 4, reason: MISSING }]).title,
      summarizeImport(0, []).title,
    ];
    for (const title of titles) {
      expect(title.split(' ').length).toBeLessThanOrEqual(3);
    }
  });

  it('ends every description with a period', () => {
    for (const summary of [summarizeImport(1, []), summarizeImport(2, rows(1, 4)), summarizeImport(0, rows(2, 4)), summarizeImport(0, [])]) {
      expect(summary.description.endsWith('.')).toBe(true);
    }
  });
});
