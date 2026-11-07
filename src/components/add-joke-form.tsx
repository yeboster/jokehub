
"use client";

import type { FC } from 'react';
import { useForm, useWatch, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Loader2, ShieldAlert } from 'lucide-react';
import { useState, useEffect, useLayoutEffect, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useJokes } from '@/contexts/JokeContext';
import Link from 'next/link';
import { CategoryCombobox } from '@/components/CategoryCombobox';

const jokeFormSchema = z.object({
  text: z.string().min(1, 'Joke text cannot be empty.'),
  category: z.string().trim().min(1, 'Category cannot be empty. Type a new one or select from suggestions.'),
  // Mirrors the `source.size() <= 100` create rule in `firestore.rules` (and
  // the CSV import's own check) — without it the write fails on the rules.
  source: z.string().max(100, 'Source cannot exceed 100 characters.').optional(),
});

export type JokeFormValues = z.infer<typeof jokeFormSchema>; // Exporting for use in parent

/** Values to load into the form. A new `key` reloads it, even for the same text. */
export type JokeFormPrefill = { key: string; text: string; category: string; source: string };

interface AddJokeFormProps {
  /** Resolve when saved (the form resets); reject to keep the fields as typed. */
  onAddJoke: (data: JokeFormValues) => Promise<void>;
  /**
   * A new `key` asks to load these values. They are ignored while a save is in
   * flight, and the user is asked first when the fields hold unsaved edits.
   */
  prefill?: JokeFormPrefill | null;
  /** Called once a prefill is actually loaded into the fields. */
  onPrefillApplied?: (key: string) => void;
}

const EMPTY_VALUES = { text: '', category: '', source: '' };

const AddJokeForm: FC<AddJokeFormProps> = ({ onAddJoke, prefill, onPrefillApplied }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  // The text field is disabled while submitting, so focus waits for re-enable.
  // A DOM ref, not `form.setFocus`: `form.reset` empties RHF's field registry
  // until the next render, so `setFocus` right after it does nothing.
  // A counter, not a flag: a fast save batches submitting true→false into one
  // render, and an unchanged `isSubmitting` would not re-run the effect.
  const [saveCount, setSaveCount] = useState(0);
  const textField = useRef<HTMLTextAreaElement | null>(null);
  const { user } = useAuth();
  const { loadingCategories } = useJokes();

  const form = useForm<JokeFormValues>({
    resolver: zodResolver(jokeFormSchema),
    defaultValues: {
      text: '',
      category: '',
      source: '',
    },
  });

  // `applied` is the prefill the fields were last loaded from (null = empty
  // form); the fields are dirty when they differ from it.
  const [applied, setApplied] = useState<JokeFormPrefill | null>(null);
  const [asking, setAsking] = useState<JokeFormPrefill | null>(null);
  const [seenKey, setSeenKey] = useState<string | null>(null);
  const values = useWatch({ control: form.control });
  const baseline = applied ?? EMPTY_VALUES;
  const dirty = (values.text ?? '') !== baseline.text || (values.category ?? '') !== baseline.category || (values.source ?? '') !== baseline.source;

  // A new key is handled once, during render (React's "adjust state when a
  // prop changes" pattern). Mid-save it is dropped: the post-save reset would
  // wipe it, and the caller would link a card the form never showed.
  if (prefill && prefill.key !== seenKey) {
    setSeenKey(prefill.key);
    if (!isSubmitting) {
      if (dirty) setAsking(prefill);
      else setApplied(prefill);
    }
  }

  const appliedKey = applied?.key;
  useEffect(() => {
    if (!applied) return;
    // The combobox seeds its search box from the category each time it opens.
    form.reset({ text: applied.text, category: applied.category, source: applied.source });
    textField.current?.focus();
    onPrefillApplied?.(applied.key);
    // Only a newly applied key reloads: re-renders must not overwrite edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedKey, form]);

  // Where focus goes back to when the user keeps their edits (the Edit
  // button they pressed). Captured before the dialog moves focus into itself.
  const returnFocus = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (asking) returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, [asking]);
  const replaced = useRef(false);

  const focusedSave = useRef(0);
  useEffect(() => {
    if (isSubmitting || saveCount === focusedSave.current) return;
    focusedSave.current = saveCount;
    textField.current?.focus();
  }, [saveCount, isSubmitting]);

  const onSubmit: SubmitHandler<JokeFormValues> = async (data) => {
    if (!user) {
      form.setError('root', { message: 'You must be logged in to add a joke.' });
      return;
    }
    setIsSubmitting(true);
    try {
      await onAddJoke(data);
      // Only on success. The fields are the user's work; a failed write is not
      // a reason to throw it away.
      form.reset(EMPTY_VALUES);
      setApplied(null);
      // Ready for the next joke without reaching for the mouse.
      setSaveCount(count => count + 1);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Failed to add joke from form:', error);
      // `handleApiCall` suppresses exactly these two messages, on the stated
      // assumption that the caller surfaces them in context. Nothing did, so
      // they reached the user nowhere at all. Everything else was already
      // announced by the context's error toast.
      if (message.includes('Category')) {
        form.setError('category', { message });
      } else if (message.includes('permission denied')) {
        form.setError('root', { message: 'You do not have permission to add this joke.' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Deliberately does NOT include `loadingCategories`: it used to disable the
  // joke text field too, so the user could not start writing until a
  // subscription feeding one combobox had landed. `CategoryCombobox` disables
  // itself while categories load.
  const isFormDisabled = !user || isSubmitting;

  return (
    <>
      {!user && (
        <Alert className="mb-3 border-primary/30 bg-primary/10 text-primary [&>svg]:text-primary">
          <ShieldAlert className="h-4 w-4" />
          <AlertDescription>
            Please <Link href="/auth?redirect=/jokes" className="font-semibold underline hover:text-primary/80">log in or sign up</Link> to add jokes.
          </AlertDescription>
        </Alert>
      )}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="text"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Joke Text</FormLabel>
                <FormControl>
                  {/* No `text-sm`: `Textarea` is `text-base md:text-sm` on
                      purpose, and anything under 16px makes iOS Safari zoom
                      the viewport when the field takes focus. */}
                  <Textarea
                    placeholder="Enter the joke text…"
                    {...field}
                    ref={element => { field.ref(element); textField.current = element; }}
                    disabled={isFormDisabled}
                    rows={3}
                    className="h-auto"
                    aria-required
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
               <FormItem className="flex flex-col">
                  <FormLabel>Category (for your jokes)</FormLabel>
                  <FormControl>
                    <CategoryCombobox
                      value={field.value}
                      onChange={(category) => form.setValue('category', category, { shouldValidate: true })}
                      disabled={isFormDisabled}
                      className="h-9"
                      aria-required
                    />
                  </FormControl>
                   <FormMessage />
                </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="source"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Source (Optional)</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., A friend, a book" {...field} disabled={isFormDisabled} className="h-9" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
           {form.formState.errors.root && (
              /*
                Not <FormMessage>: that reads FormFieldContext, which does not
                exist out here. It rendered with the id
                `undefined-form-item-message`, was referenced by no control and
                carried no role — so "You do not have permission to add this
                joke." was announced by nothing at all. A root error is a
                statement about the whole form, which is what role="alert" is
                for; it fires the moment the element appears.
              */
              <p role="alert" className="text-sm font-medium text-error">
                {form.formState.errors.root.message}
              </p>
           )}
          <Button type="submit" className="w-full" disabled={isFormDisabled || loadingCategories} size="sm">
            {isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            {isSubmitting ? 'Adding…' : 'Add This Joke'}
          </Button>
        </form>
      </Form>
      <AlertDialog open={!!asking} onOpenChange={open => { if (!open) setAsking(null); }}>
        <AlertDialogContent
          onCloseAutoFocus={event => {
            event.preventDefault();
            if (replaced.current) textField.current?.focus();
            else returnFocus.current?.focus();
            replaced.current = false;
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Replace the joke you&apos;re editing?</AlertDialogTitle>
            <AlertDialogDescription>
              The form has changes that are not saved. Replacing loads the generated joke instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={() => { replaced.current = true; setApplied(asking); setAsking(null); }}>Replace</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default AddJokeForm;
