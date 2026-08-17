
"use client";

import type { FC } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Loader2, ShieldAlert, Check, ChevronsUpDown } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useJokes } from '@/contexts/JokeContext';
import Link from 'next/link';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { cn } from '@/lib/utils';

const jokeFormSchema = z.object({
  text: z.string().min(1, 'Joke text cannot be empty.'),
  category: z.string().trim().min(1, 'Category cannot be empty. Type a new one or select from suggestions.'),
  source: z.string().optional(),
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
  const { categories, loadingCategories } = useJokes();
  const [isCategoryPopoverOpen, setCategoryPopoverOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');

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
      form.setValue('category', aiGeneratedCategory, { shouldValidate: true });
      // eslint-disable-next-line react-hooks/set-state-in-effect -- keep the category search box in sync when the AI suggests a category.
      setCategorySearch(aiGeneratedCategory);
    } else if (aiGeneratedCategory === null) { 
        form.setValue('category', '', { shouldValidate: true });
        setCategorySearch('');
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
      setCategorySearch('');
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
  const categoryNames = useMemo(() => {
    if (!categories || !user) return [];
    return Array.isArray(categories) ? categories.filter(cat => cat.userId === user.uid).map(cat => cat.name).sort() : [];
  }, [categories, user]);


  const categoryOptions = useMemo(() => {
    let filtered = categoryNames;
    if (categorySearch) {
        filtered = categoryNames.filter(name =>
            name.toLowerCase().includes(categorySearch.toLowerCase())
        );
    }

    const options = filtered.map(name => ({ value: name, label: name }));
    const searchTermTrimmed = categorySearch.trim();
    const exactMatchFound = categoryNames.some(name => name.toLowerCase() === searchTermTrimmed.toLowerCase());

    if (searchTermTrimmed && !exactMatchFound) {
      options.unshift({ value: searchTermTrimmed, label: `Create "${searchTermTrimmed}"` });
    }
    return options;
  }, [categoryNames, categorySearch]);

  return (
    <Card className="shadow-none border-0">
      <CardHeader className="p-0 pt-1"> 
        <CardTitle className="text-xs font-semibold">Or Add Manually</CardTitle> 
      </CardHeader>
      <CardContent className="p-0 pt-1.5"> 
        {!user && (
          <div className="mb-3 p-2.5 rounded-md bg-yellow-50 border border-yellow-200 text-yellow-700 flex items-center text-sm">
            <ShieldAlert className="mr-2 h-4 w-4 flex-shrink-0" />
            <div>
              Please <Link href="/auth?redirect=/jokes" className="font-semibold underline hover:text-yellow-800">log in or sign up</Link> to add jokes.
            </div>
          </div>
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
                     <Popover open={isCategoryPopoverOpen} onOpenChange={setCategoryPopoverOpen}>
                        <PopoverTrigger asChild>
                         <FormControl>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={isCategoryPopoverOpen}
                              className={cn("w-full justify-between text-sm h-9", !field.value && "text-muted-foreground")} 
                              disabled={isFormDisabled || loadingCategories}
                            >
                              <span className="truncate">
                                {loadingCategories
                                  ? "Loading categories..."
                                  : field.value
                                    ? categoryNames.find(
                                        (name) => name.toLowerCase() === field.value.toLowerCase()
                                      ) || field.value 
                                    : "Select or type category..."}
                              </span>
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-[--radix-popover-trigger-width] p-0 max-h-60 overflow-y-auto" align="start">
                          <Command> 
                            <CommandInput
                                placeholder="Search or create category..."
                                value={categorySearch}
                                onValueChange={setCategorySearch}
                                className="h-9" 
                            />
                             <CommandList>
                                <CommandEmpty>
                                    {loadingCategories ? "Loading..." : categorySearch.trim() ? `No personal category found. Create "${categorySearch.trim()}"?` : 'No personal categories found.'}
                                </CommandEmpty>
                                <CommandGroup>
                                  {categoryOptions.map((option) => (
                                    <CommandItem
                                      key={option.value} 
                                      value={option.label} 
                                      onSelect={() => {
                                        form.setValue('category', option.value, {shouldValidate: true}); 
                                        setCategorySearch(option.value); 
                                        setCategoryPopoverOpen(false);
                                      }}
                                    >
                                      <Check
                                        className={cn(
                                          "mr-2 h-4 w-4",
                                          field.value?.toLowerCase() === option.value.toLowerCase() 
                                            ? "opacity-100"
                                            : "opacity-0"
                                        )}
                                      />
                                      {option.label}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                             </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
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
