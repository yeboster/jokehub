
"use client";

import type { FC } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Loader2, ShieldAlert } from 'lucide-react';
import { useState, useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Alert, AlertDescription } from '@/components/ui/alert';
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

interface AddJokeFormProps {
  onAddJoke: (data: JokeFormValues) => Promise<void>;
  aiGeneratedText?: string | null;
  aiGeneratedCategory?: string | null;
  aiGeneratedSource?: string | null;
  onAiJokeSubmitted?: () => void;
}

const AddJokeForm: FC<AddJokeFormProps> = ({ onAddJoke, aiGeneratedText, aiGeneratedCategory, aiGeneratedSource, onAiJokeSubmitted }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  useEffect(() => {
    if (aiGeneratedText) {
      form.setValue('text', aiGeneratedText, { shouldValidate: true });
    } else if (aiGeneratedText === null) { 
        form.setValue('text', '', { shouldValidate: true });
    }

    if (aiGeneratedCategory) {
      // The combobox seeds its search box from this value each time it opens.
      form.setValue('category', aiGeneratedCategory, { shouldValidate: true });
    } else if (aiGeneratedCategory === null) {
        form.setValue('category', '', { shouldValidate: true });
    }

    if (aiGeneratedSource) {
      form.setValue('source', aiGeneratedSource, { shouldValidate: true });
    } else if (aiGeneratedSource === null) {
      form.setValue('source', '', { shouldValidate: true });
    }
  }, [aiGeneratedText, aiGeneratedCategory, aiGeneratedSource, form]);

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
      form.reset();
      if (aiGeneratedText && onAiJokeSubmitted) {
        onAiJokeSubmitted();
      }
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
                  <Textarea placeholder="Enter the joke text…" {...field} disabled={isFormDisabled} rows={3} className="h-auto" aria-required />
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
    </>
  );
};

export default AddJokeForm;
