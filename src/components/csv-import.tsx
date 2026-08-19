
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
import { parseCSVLine } from '@/lib/csv';
import { summarizeImport, type SkippedRow } from '@/lib/csvReport';

interface CSVImportProps {
  // Defines the expected structure of jokes after parsing from CSV, before adding to DB
  onImport: (jokes: Omit<Joke, 'id' | 'used' | 'dateAdded' | 'userId'>[]) => Promise<void>;
}

/** Mirrors the `source.size() <= 100` create rule in `firestore.rules`. */
const MAX_SOURCE_LENGTH = 100;

const CSVImport: FC<CSVImportProps> = ({ onImport }) => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  // Mirrors the toast into a region that stays on the page. A toast is
  // announced once and then has to be dismissed; an import result is
  // something the user reads back against their file.
  const [statusMessage, setStatusMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth(); // Get user state from AuthContext

  // Handles the CSV file selection and processing
  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    // Every new attempt starts from an empty status line. The early returns
    // below report through a toast only, and a held "Import finished…" from the
    // last run would sit next to that toast and contradict it.
    setStatusMessage('');

    // Check if user is logged in
    if (!user) {
      toast({
        title: 'Sign in required',
        description: 'Log in to import jokes.',
        variant: 'destructive',
      });
      if (fileInputRef.current) fileInputRef.current.value = ''; // Clear file input
      return;
    }

    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setStatusMessage('Processing your file…');
    const reader = new FileReader();

    reader.onload = async (e) => {
      const text = e.target?.result;
      if (typeof text !== 'string') {
        toast({
          title: "Couldn't read that file",
          description: 'Could not read the file content.',
          variant: 'destructive',
        });
        // The destructive toast is the report for this path.
        setStatusMessage('');
        setIsLoading(false);
        return;
      }

      // Distinguishes "the file is bad" from "the write failed", which need
      // different reporting and used to get the same toast.
      let writeStarted = false;

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

        const summary = summarizeImport(importedJokes.length, skippedRows);
        if (importedJokes.length > 0) {
          writeStarted = true;
          await onImport(importedJokes);
        }
        setStatusMessage(`${summary.title}. ${summary.description}`);
        toast({
          title: summary.title,
          description: summary.description,
          variant: 'default',
        });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Firestore and parse errors have different dynamic shapes.
      } catch (error: any) {
        const message = error?.message || 'Failed to parse or process the CSV file.';
        if (writeStarted) {
          // The write failed, not the file. `handleApiCall` has already
          // announced it, and with TOAST_LIMIT at 1 a second toast here would
          // *evict* that one and blame the user's file for a permission or
          // network failure. The page carries the detail instead — including
          // `jokeService.importJokes`'s partial count ("Imported 40 of 120
          // jokes before the import failed: …"), which says what state the
          // collection is now in and exists nowhere else in the UI.
          setStatusMessage(`Import failed. ${message.replace(/[.!?]?$/, '.')}`);
        } else {
          // Nothing was written, so nothing else has reported this: the file
          // never got past parsing.
          toast({
            title: "Couldn't import that file",
            description: message,
            variant: 'destructive',
          });
          setStatusMessage('');
        }
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
        title: "Couldn't read that file",
        description: 'An error occurred while reading the file.',
        variant: 'destructive',
      });
      // The destructive toast is the report for this path.
      setStatusMessage('');
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
        <CardTitle as="h2">Import Jokes from CSV</CardTitle>
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
          {/* Always in the DOM so it is a live region *before* the text
              changes — a role="status" mounted with its message already in
              it does not announce. `min-h` keeps the card from jumping as
              the sentence appears. Carries the outcome either way: a
              successful or partial import, or a failed write with however
              many rows made it in before it failed. */}
          <p role="status" className="mt-2 min-h-[1.25rem] text-center text-sm text-muted-foreground">
            {statusMessage}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default CSVImport;
