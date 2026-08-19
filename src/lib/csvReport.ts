/**
 * What a CSV import says about itself — the same sentence in the toast and in
 * the page's status region, built once here.
 *
 * Strings only: `src/lib/` is outside Tailwind's content globs
 * (`tailwind.config.ts`), so nothing here may return a class name.
 */

export interface SkippedRow {
  /** 1-based line number in the uploaded file, blank lines included. */
  lineNumber: number;
  reason: string;
}

/** How many individual row numbers to name before summarizing the rest. */
export const MAX_REPORTED_ROWS = 10;

/**
 * `rows 4, 19, 27 and 3 more (missing "text" or "category")` — the row numbers
 * as the user sees them in their file, plus every distinct reason.
 */
export function describeSkippedRows(skipped: SkippedRow[]): string {
  const listed = skipped.slice(0, MAX_REPORTED_ROWS).map((row) => row.lineNumber);
  const remainder = skipped.length - listed.length;
  const rowList = `row${skipped.length === 1 ? '' : 's'} ${listed.join(', ')}${remainder > 0 ? ` and ${remainder} more` : ''}`;
  const reasons = Array.from(new Set(skipped.map((row) => row.reason)));
  return `${rowList} (${reasons.join('; ')})`;
}

export interface ImportSummary {
  /**
   * Toast title — sentence case, kept short (see `use-toast.ts`). The
   * convention is three words or fewer; `Import finished with skipped rows`
   * is the one exception, because the partial outcome needs the words.
   */
  title: string;
  /** One sentence, ending in a period. */
  description: string;
}

/**
 * The outcome of an import, in the four shapes it comes in: everything landed,
 * some landed and some were skipped, nothing landed because every row was
 * skipped, nothing landed because there was nothing to land.
 */
export function summarizeImport(importedCount: number, skipped: SkippedRow[]): ImportSummary {
  if (importedCount > 0) {
    return skipped.length > 0
      ? {
          title: 'Import finished with skipped rows',
          description: `${importedCount} imported, ${skipped.length} skipped — ${describeSkippedRows(skipped)}.`,
        }
      : {
          title: 'Import finished',
          description: `${importedCount} joke${importedCount === 1 ? '' : 's'} imported.`,
        };
  }

  return skipped.length > 0
    ? {
        title: 'Nothing imported',
        description: `No jokes imported — all ${skipped.length} row${skipped.length === 1 ? '' : 's'} skipped: ${describeSkippedRows(skipped)}.`,
      }
    : {
        title: 'Nothing imported',
        description: 'No valid jokes found in the CSV file to import.',
      };
}
