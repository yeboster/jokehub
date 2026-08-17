
"use client";

import type { FC, ChangeEvent } from 'react';
import { useState, useRef } from 'react';
import { ShieldAlert } from 'lucide-react';
import Link from 'next/link';

import type { Joke } from '@/lib/types'; // Ensure this path and type are correct

import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast'; // Ensure this path is correct
import { useAuth } from '@/contexts/AuthContext'; // Ensure this path is correct
import { cn } from '@/lib/utils';

interface CSVImportProps {
  // Defines the expected structure of jokes after parsing from CSV, before adding to DB
  onImport: (jokes: Omit<Joke, 'id' | 'used' | 'dateAdded' | 'userId'>[]) => Promise<void>;
}

/** Mirrors the `source.size() <= 100` create rule in `firestore.rules`. */
const MAX_SOURCE_LENGTH = 100;
/** How many individual row numbers to name before summarizing the rest. */
const MAX_REPORTED_ROWS = 10;

interface SkippedRow {
  /** 1-based line number in the uploaded file, blank lines included. */
  lineNumber: number;
  reason: string;
}

/**
 * `rows 4, 19, 27 and 3 more (missing "text" or "category")` — the row numbers
 * as the user sees them in their file, plus every distinct reason.
 */
function describeSkippedRows(skipped: SkippedRow[]): string {
  const listed = skipped.slice(0, MAX_REPORTED_ROWS).map((row) => row.lineNumber);
  const remainder = skipped.length - listed.length;
  const rowList = `row${skipped.length === 1 ? '' : 's'} ${listed.join(', ')}${remainder > 0 ? ` and ${remainder} more` : ''}`;
  const reasons = Array.from(new Set(skipped.map((row) => row.reason)));
  return `${rowList} (${reasons.join('; ')})`;
}

const CSVImport: FC<CSVImportProps> = ({ onImport }) => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth(); // Get user state from AuthContext

  // Handles the CSV file selection and processing
  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    // Check if user is logged in
    if (!user) {
      toast({
        title: 'Authentication Required',
        description: 'Please log in to import jokes.',
        variant: 'destructive',
      });
      if (fileInputRef.current) fileInputRef.current.value = ''; // Clear file input
      return;
    }

    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    const reader = new FileReader();

    reader.onload = async (e) => {
      const text = e.target?.result;
      if (typeof text !== 'string') {
        toast({
          title: 'Error Reading File',
          description: 'Could not read the file content.',
          variant: 'destructive',
        });
        setIsLoading(false);
        return;
      }

      try {
        // Drop empty lines but keep each remaining line's original position, so
        // a skipped row is reported by the number the user sees in their editor.
        const lines = text
          .split('\n')
          .map((line, index) => ({ line, lineNumber: index + 1 }))
          .filter((entry) => entry.line.trim() !== '');
        if (lines.length <= 1) { // Must have headers and at least one data row
          throw new Error('CSV file needs a header row and at least one data row.');
        }

        // More robust CSV line parser that handles commas within quotes and escaped quotes ("")
        const parseCSVLine = (line: string): string[] => {
          const values: string[] = [];
          let currentValue = '';
          let inQuotes = false;

          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
              // If already in quotes and next char is also a quote, it's an escaped quote
              if (inQuotes && line[i + 1] === '"') {
                currentValue += '"';
                i++; // Skip the next quote
              } else {
                inQuotes = !inQuotes; // Toggle inQuotes state
              }
            } else if (char === ',' && !inQuotes) {
              values.push(currentValue); // Push the accumulated value
              currentValue = ''; // Reset for the next value
            } else {
              currentValue += char; // Accumulate character to current value
            }
          }
          values.push(currentValue); // Push the last value
          return values;
        };

        // Parse header row and normalize to lowercase
        const headerCells = parseCSVLine(lines[0].line);
        const headers = headerCells.map(h => h.trim().toLowerCase());

        // Find indices of required and optional columns
        const textIndex = headers.indexOf('text');
        const categoryIndex = headers.indexOf('category');
        const funnyRateIndex = headers.indexOf('funnyrate');
        const sourceIndex = headers.indexOf('source');

        // Ensure essential columns are present
        if (textIndex === -1 || categoryIndex === -1) {
          throw new Error('CSV must contain "text" and "category" columns in the header.');
        }

        const importedJokes: Omit<Joke, 'id' | 'used' | 'dateAdded' | 'userId'>[] = [];
        // Rows the import rules would reject are dropped here, one by one, and
        // reported back — a single bad row used to fail the whole batch.
        const skippedRows: SkippedRow[] = [];

        // Process data rows (starting from the second line)
        for (const { line, lineNumber } of lines.slice(1)) {
          const values = parseCSVLine(line);
          const jokeText = values[textIndex]?.trim() ?? '';
          const category = values[categoryIndex]?.trim() ?? '';

          if (!jokeText || !category) {
            skippedRows.push({ lineNumber, reason: 'missing "text" or "category"' });
            console.warn(`Skipping row ${lineNumber}: "${line}". Ensure 'text' and 'category' are present and valid.`);
            continue;
          }

          const source = sourceIndex !== -1 ? values[sourceIndex]?.trim() ?? '' : '';
          if (source.length > MAX_SOURCE_LENGTH) {
            skippedRows.push({ lineNumber, reason: `"source" longer than ${MAX_SOURCE_LENGTH} characters` });
            console.warn(`Skipping row ${lineNumber}: source is ${source.length} characters (max ${MAX_SOURCE_LENGTH}).`);
            continue;
          }

          let rate = 0; // Default funnyRate
          // Process funnyRate if column exists and value is present
          if (funnyRateIndex !== -1 && values[funnyRateIndex]?.trim()) {
            const parsedRate = parseInt(values[funnyRateIndex].trim(), 10);
            // Validate parsedRate: must be a number between 0 and 5
            if (!isNaN(parsedRate) && parsedRate >= 0 && parsedRate <= 5) {
              rate = parsedRate;
            } else {
              console.warn(`Invalid funnyRate value "${values[funnyRateIndex]}" in row ${lineNumber}. Using default 0.`);
            }
          }

          importedJokes.push({
            text: jokeText,
            category,
            source: source || undefined,
            funnyRate: rate,
          });
        }

        if (importedJokes.length > 0) {
          await onImport(importedJokes); // Call the provided onImport function
          toast({
            title: skippedRows.length > 0 ? 'Import Finished With Skipped Rows' : 'Import Successful',
            description:
              skippedRows.length > 0
                ? `${importedJokes.length} imported, ${skippedRows.length} skipped — ${describeSkippedRows(skippedRows)}.`
                : `${importedJokes.length} joke(s) imported.`,
          });
        } else {
           toast({
            title: 'Import Information',
            description:
              skippedRows.length > 0
                ? `No jokes imported — all ${skippedRows.length} row(s) were skipped: ${describeSkippedRows(skippedRows)}.`
                : 'No valid jokes found in the CSV file to import.',
            variant: 'default', // Or 'destructive' if considered an error
          });
        }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- PapaParse error objects have a dynamic shape.
      } catch (error: any) {
        toast({
          title: 'Import Error',
          description: error.message || 'Failed to parse or process the CSV file.',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
        // Reset file input so the same file can be selected again if needed
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
      }
    };

    reader.onerror = () => {
      toast({
        title: 'File Read Error',
        description: 'An error occurred while reading the file.',
        variant: 'destructive',
      });
      setIsLoading(false);
       if (fileInputRef.current) {
          fileInputRef.current.value = '';
       }
    };

    reader.readAsText(file); // Start reading the file
  };

  // Determine if the import controls should be disabled
  const isImportDisabled = !user || isLoading;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import Jokes from CSV</CardTitle>
        <CardDescription>
          Upload a CSV file with &quot;text&quot;, &quot;category&quot; columns. Optionally include &quot;funnyrate&quot; (0-5) and &quot;source&quot;.
          Headers are case-insensitive.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Display message if user is not logged in */}
        {!user && (
          <Alert className="mb-4 border-primary/30 bg-primary/10 text-primary [&>svg]:text-primary">
            <ShieldAlert className="h-4 w-4" />
            <AlertDescription>
              Please <Link href="/auth?redirect=/manage" className="font-semibold underline hover:text-primary/80">log in or sign up</Link> to import jokes.
            </AlertDescription>
          </Alert>
        )}
        <div className="grid max-w-sm items-center gap-1.5 mx-auto">
          <Label htmlFor="csv-file" className="text-center">Select CSV File</Label>
          <div className="flex w-full items-center space-x-2">
             <Input
                id="csv-file"
                type="file"
                accept=".csv, text/csv" 
                onChange={handleFileChange}
                disabled={isImportDisabled}
                ref={fileInputRef}
                className={cn(
                    "cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    "file:cursor-pointer file:text-sm file:font-semibold",
                    "file:bg-accent file:text-accent-foreground",
                    "file:border-none file:rounded-md file:px-3 file:py-1.5",
                    "hover:file:bg-accent/90"
                )}
             />
          </div>
          {isLoading && <p className="text-sm text-muted-foreground mt-2 text-center">Processing file, please wait...</p>}
        </div>
      </CardContent>
    </Card>
  );
};

export default CSVImport;
