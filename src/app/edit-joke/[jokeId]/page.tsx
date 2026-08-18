
"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Save, ArrowLeft, ShieldAlert, Trash2 } from 'lucide-react';

import type { Joke } from '@/lib/types';
import { useAuth } from '@/contexts/AuthContext';
import { useJokes } from '@/contexts/JokeContext';
import Header from '@/components/header';
import PageLoading from '@/components/PageLoading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { CategoryCombobox } from '@/components/CategoryCombobox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

const editJokeFormSchema = z.object({
  text: z.string().min(1, 'Joke text cannot be empty.'),
  category: z.string().trim().min(1, 'Category cannot be empty. Type a new one or select from suggestions.'),
  source: z.string().optional(),
  used: z.boolean().optional().default(false),
});

type EditJokeFormValues = z.infer<typeof editJokeFormSchema>;

export default function EditJokePage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const { getJokeById, updateJoke, deleteJoke, loadingCategories } = useJokes();
  const [joke, setJoke] = useState<Joke | null>(null);
  const [loadingJokeData, setLoadingJokeData] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const jokeId = Array.isArray(params.jokeId) ? params.jokeId[0] : params.jokeId;

  const form = useForm<EditJokeFormValues>({
    resolver: zodResolver(editJokeFormSchema),
    defaultValues: { text: '', category: '', source: '', used: false },
  });

  useEffect(() => {
    async function fetchJokeAndCheckOwnership() {
      if (!jokeId || !user) {
        setLoadingJokeData(false);
        if (!user && !authLoading) router.push(`/auth?redirect=/edit-joke/${jokeId}`);
        return;
      }
      setLoadingJokeData(true);
      setFetchError(null);
      try {
        const fetchedJoke = await getJokeById(jokeId);
        if (fetchedJoke) {
          if (fetchedJoke.userId !== user.uid) {
            setFetchError('You do not have permission to edit this joke.');
            toast({ title: 'Access Denied', description: 'You can only edit your own jokes.', variant: 'destructive' });
            setJoke(null);
          } else {
            setJoke(fetchedJoke);
            form.reset({
              text: fetchedJoke.text,
              category: fetchedJoke.category,
              source: fetchedJoke.source || '',
              used: fetchedJoke.used,
            });
          }
        } else {
           setFetchError('Joke not found.');
           toast({ title: 'Error', description: 'Joke not found.', variant: 'destructive' });
        }
      } catch (error) {
        console.error('Error fetching joke for editing:', error);
        setFetchError('Failed to load joke data.');
        toast({ title: 'Error', description: 'Failed to load joke data.', variant: 'destructive' });
      } finally {
        setLoadingJokeData(false);
      }
    }

    if (!authLoading) {
         if (!user) {
             router.push(`/auth?redirect=/edit-joke/${jokeId}`);
         } else {
            fetchJokeAndCheckOwnership();
         }
    }
  }, [jokeId, user, authLoading, getJokeById, form, router, toast]);

  const onSubmit: SubmitHandler<EditJokeFormValues> = async (data) => {
    if (!user || !joke || joke.userId !== user.uid) {
        toast({ title: 'Error', description: 'Cannot update joke. Please try again.', variant: 'destructive'});
        return;
    }

     if (data.text === joke.text && data.category === joke.category && data.source === joke.source && data.used === joke.used) {
         toast({ title: 'No Changes', description: 'No changes were made to the joke.' });
         router.push('/jokes');
         return;
     }

    setIsSubmitting(true);
    try {
      await updateJoke(joke.id, data);
      toast({ title: 'Success', description: 'Joke updated successfully!' });
      router.push('/jokes');
    } catch (error) {
      console.error("Failed to update joke:", error);
       if (!(error instanceof Error && (error.message.includes("Category") || error.message.includes("permission denied")))) {
           toast({ title: 'Update Error', description: 'Failed to update joke.', variant: 'destructive' });
       }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!user || !joke) {
      toast({ title: 'Error', description: 'Cannot delete joke. Please try again.', variant: 'destructive' });
      return;
    }
    setIsDeleting(true);
    try {
      await deleteJoke(joke.id);
      toast({ title: 'Success', description: 'Joke has been deleted.' });
      router.push('/jokes');
    } catch (error) {
       console.error("Failed to delete joke:", error);
       toast({ title: 'Delete Error', description: 'Failed to delete joke.', variant: 'destructive' });
    } finally {
       setIsDeleting(false);
    }
  };

  const isFormDisabled = authLoading || loadingJokeData || loadingCategories || isSubmitting || isDeleting || !user || !!fetchError || (joke !== null && joke.userId !== user?.uid);

  if (authLoading) {
      return <PageLoading label="Checking your sign-in…" />;
  }
   if (loadingJokeData || loadingCategories) {
    return <PageLoading label="Loading this joke…" />;
   }

    if (fetchError) {
        return (
            <div className="container mx-auto px-4 py-8 sm:px-6 md:py-12">
                 <Header title="Edit Joke" />
                 <Card className="max-w-2xl mx-auto">
                    <CardHeader> <CardTitle className="text-lg text-destructive">Error</CardTitle> </CardHeader>
                    <CardContent>
                        <div className="mb-4 p-3 rounded-md bg-destructive/10 border border-destructive/30 text-destructive flex items-center">
                             <ShieldAlert className="mr-2 h-5 w-5 flex-shrink-0" /> <p>{fetchError}</p>
                        </div>
                        <Button variant="outline" onClick={() => router.push('/jokes')}>
                            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Jokes
                        </Button>
                    </CardContent>
                 </Card>
            </div>
        );
    }
    if (!joke) {
         return (
            <div className="container mx-auto px-4 py-8 sm:px-6 md:py-12">
                 <Header title="Edit Joke" />
                 <Card className="max-w-2xl mx-auto"> <CardHeader><CardTitle className="text-lg">Joke Not Editable</CardTitle></CardHeader>
                    <CardContent>
                        <p className="text-muted-foreground mb-4">This joke cannot be edited or was not found.</p>
                        <Button variant="outline" onClick={() => router.push('/jokes')}>
                            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Jokes
                        </Button>
                    </CardContent>
                 </Card>
            </div>
        );
    }


  return (
    <div className="container mx-auto px-4 py-8 sm:px-6 md:py-12">
      <Header title="Edit Your Joke" />
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="text-lg">Update Joke Details</CardTitle>
          <CardDescription>Make changes to the joke text, category, or usage status.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField control={form.control} name="text" render={({ field }) => (
                  <FormItem> <FormLabel>Joke Text</FormLabel> <FormControl>
                      <Textarea placeholder="Enter the joke text…" {...field} disabled={isFormDisabled} rows={5} />
                  </FormControl> <FormMessage /> </FormItem>
              )} />
              <FormField control={form.control} name="category" render={({ field }) => (
                 <FormItem className="flex flex-col"> <FormLabel>Category</FormLabel>
                    <FormControl>
                      <CategoryCombobox
                        value={field.value}
                        onChange={(category) => form.setValue('category', category, { shouldValidate: true })}
                        disabled={isFormDisabled}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
              )} />
              <FormField control={form.control} name="source" render={({ field }) => (
                <FormItem>
                  <FormLabel>Source (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., A friend, a book" {...field} disabled={isFormDisabled} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
               <FormField
                control={form.control}
                name="used"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                    <div className="space-y-0.5">
                      <FormLabel>Joke Used</FormLabel>
                      <FormDescription>
                        Mark this joke as used (e.g., told in a show).
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isFormDisabled}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <div className="flex flex-col sm:flex-row gap-2 justify-between items-center">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="destructive" disabled={isFormDisabled}>
                        <Trash2 className="mr-2 h-4 w-4" /> Delete Joke
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you sure you want to delete this joke?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete your joke and all associated ratings from our servers.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDelete}
                        disabled={isDeleting}
                        className="bg-destructive hover:bg-destructive/90"
                      >
                         {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                         {isDeleting ? 'Deleting…' : 'Yes, delete joke'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <div className="flex flex-col sm:flex-row gap-2">
                    <Button type="button" variant="outline" onClick={() => router.push('/jokes')} disabled={isFormDisabled}>
                        <ArrowLeft className="mr-2 h-4 w-4" /> Cancel
                    </Button>
                    <Button type="submit" disabled={isFormDisabled}>
                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    {isSubmitting ? 'Saving…' : 'Save Changes'}
                    </Button>
                </div>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
