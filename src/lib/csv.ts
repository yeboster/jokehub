/**
 * Minimal CSV field parser for the joke importer.
 *
 * Handles the quoting rules RFC 4180 defines *within* a line: commas inside
 * double quotes, `""` as an escaped quote, and empty fields.
 *
 * KNOWN LIMITATION — quoted fields cannot contain newlines. The caller
 * (`csv-import.tsx`) splits the file on `\n` before any quote parsing, so a
 * field written as `"line one\nline two"` arrives here already cut in half:
 * the first half ends with an unterminated quote and the second half is read
 * as its own row. Fixing it means moving the line split into this module (a
 * tokenizer that tracks `inQuotes` across newlines) or adopting a real CSV
 * library; neither is warranted while the importer's own columns are
 * single-line joke text. Unterminated quotes are otherwise tolerated: the
 * accumulated value is returned as-is rather than throwing.
 */
export function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let currentValue = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      // Inside quotes, a doubled quote is a literal quote character.
      if (inQuotes && line[i + 1] === '"') {
        currentValue += '"';
        i++; // Skip the second quote of the pair.
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(currentValue);
      currentValue = '';
    } else {
      currentValue += char;
    }
  }
  values.push(currentValue); // The field after the last comma.

  return values;
}
