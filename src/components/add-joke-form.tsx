
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
      form.setError("root", {message: "You must be logged in to add a joke."});
      return;
    }
    setIsSubmitting(true);
    try {
      await onAddJoke(data);
      form.reset();
      if (aiGeneratedText && onAiJokeSubmitted) {
        onAiJokeSubmitted();
      }
    } catch (error) {
      console.error("Failed to add joke from form:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormDisabled = !user || isSubmitting || loadingCategories;

  return (
    <Card className="shadow-none border-0">
      <CardHeader className="p-0 pt-1"> 
        <CardTitle className="text-xs font-semibold">Or Add Manually</CardTitle> 
      </CardHeader>
      <CardContent className="p-0 pt-1.5"> 
        {!user && (
          <Alert className="mb-3 border-primary/30 bg-primary/10 text-primary [&>svg]:text-primary">
            <ShieldAlert className="h-4 w-4" />
            <AlertDescription>
              Please <Link href="/auth?redirect=/jokes" className="font-semibold underline hover:text-primary/80">log in or sign up</Link> to add jokes.
            </AlertDescription>
          </Alert>
        )}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-2.5"> 
            <FormField
              control={form.control}
              name="text"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Joke Text</FormLabel> 
                  <FormControl>
                    <Textarea placeholder="Enter the joke text..." {...field} disabled={isFormDisabled} rows={3} className="text-sm h-auto" /> 
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
                    <FormLabel className="text-xs">Category (for your jokes)</FormLabel>
                    <FormControl>
                      <CategoryCombobox
                        value={field.value}
                        onChange={(category) => form.setValue('category', category, { shouldValidate: true })}
                        disabled={isFormDisabled}
                        className="text-sm h-9"
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
                  <FormLabel className="text-xs">Source (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., A friend, a book" {...field} disabled={isFormDisabled} className="text-sm h-9" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
             {form.formState.errors.root && (
                <FormMessage>{form.formState.errors.root.message}</FormMessage>
             )}
            <Button type="submit" className="w-full" disabled={isFormDisabled} size="sm">
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              {isSubmitting ? 'Adding...' : 'Add This Joke'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
};

export default AddJokeForm;
