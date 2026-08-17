
"use client";

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useJokes, type FilterParams } from '@/contexts/JokeContext';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowRight, Loader2, PlusCircle } from 'lucide-react';
import type { Joke } from '@/lib/types';
import JokeListItem from '@/components/joke-list-item';
import Logo from '@/components/logo';

// The home page renders exactly three public jokes and owns that fetch (the
// provider does not fetch on its own). Module scope keeps the object identity
// stable so the effect below runs once per auth state.
const HOME_PAGE_FILTERS: FilterParams = {
  selectedCategories: [],
  filterFunnyRate: -1,
  usageStatus: 'all',
  scope: 'public',
  search: '',
  limit: 3,
};

// Module-scope so the array identity is stable across renders; the previous
// in-component declaration made the useEffect dep array warn about a missing
// dep that, if added, would create a new array each render → infinite loop.
const HARDCODED_JOKES_FALLBACK: Joke[] = [
  { id: 'hc1', text: "Why don't scientists trust atoms? Because they make up everything!", category: "Science", dateAdded: new Date(0), used: false, funnyRate: 0, userId: 'public-fallback' },
  { id: 'hc2', text: "Why did the scarecrow win an award? Because he was outstanding in his field!", category: "Puns", dateAdded: new Date(0), used: false, funnyRate: 0, userId: 'public-fallback' },
  { id: 'hc3', text: "What do you call fake spaghetti? An impasta!", category: "Food", dateAdded: new Date(0), used: false, funnyRate: 0, userId: 'public-fallback' },
];

export default function LandingPage() {
  const { user, loading: authLoading } = useAuth();
  const { jokes, loadJokesWithFilters, loadingInitialJokes } = useJokes();
  const [displayedJokes, setDisplayedJokes] = useState<Joke[]>([]);

  useEffect(() => {
    if (authLoading) return;
    loadJokesWithFilters(HOME_PAGE_FILTERS);
  }, [authLoading, loadJokesWithFilters]);

  useEffect(() => {
    if (jokes && jokes.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- derive the displayed jokes from the async-loaded (already limit:3) jokes list.
      setDisplayedJokes(jokes.slice(0, 3));
    } else if (!loadingInitialJokes && (!jokes || jokes.length === 0)) {
      setDisplayedJokes(HARDCODED_JOKES_FALLBACK);
    } else {
      setDisplayedJokes([]);
    }
  }, [jokes, loadingInitialJokes]);


  const isLoading = authLoading || loadingInitialJokes;

  return (
    <div className="container mx-auto px-4 py-10 sm:py-16 text-center">
      <header className="mb-12 sm:mb-16">
        <Logo width={400} className="mx-auto mb-5" />
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-16">
          Your personal space to collect, create, and cherish every chuckle. Dive in and let the laughter begin!
        </p>
      </header>

      <section className="mb-12 sm:mb-16">
        <h2 className="text-3xl font-bold text-center text-primary mb-10">
          A Taste of Humor
        </h2>
        {isLoading && displayedJokes.length === 0 ? (
          <div className="flex justify-center items-center min-h-[150px]">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="ml-2 text-muted-foreground">Loading jokes...</p>
          </div>
        ) : displayedJokes.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5 md:gap-6 max-w-5xl mx-auto">
            {displayedJokes.map((joke) => (
              <JokeListItem key={joke.id} joke={joke} />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">
            No sample jokes to display right now. Check back soon!
          </p>
        )}
      </section>

      <section className="flex flex-col sm:flex-row justify-center items-center gap-3 sm:gap-4 mt-12">
        <Button size="lg" asChild className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-3 rounded-lg">
          <Link href="/jokes">
            Explore All Jokes <ArrowRight className="ml-2 h-5 w-5" />
          </Link>
        </Button>

        {user && (
           <Button size="lg" asChild className="bg-accent hover:bg-accent/90 text-accent-foreground px-6 py-3 rounded-lg">
             <Link href="/add-joke">
                <PlusCircle className="mr-2 h-5 w-5" />
                Add New Joke
             </Link>
            </Button>
        )}

        {user && (
           <Button size="lg" variant="outline" asChild className="px-6 py-3 rounded-lg border-primary/50 text-primary hover:bg-primary/5 hover:text-primary">
            <Link href="/jokes?scope=user">
              View My Collection
            </Link>
          </Button>
        )}

        {!user && !authLoading && (
          <Button size="lg" variant="outline" asChild className="px-6 py-3 rounded-lg border-primary/50 text-primary hover:bg-primary/5 hover:text-primary">
            <Link href="/auth?redirect=/jokes">
              Log In or Sign Up
            </Link>
          </Button>
        )}
      </section>

      <footer className="mt-20 pt-10 border-t border-border/30">
        <p className="text-xs sm:text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} Joke Hub. Keep laughing!
        </p>
      </footer>
    </div>
  );
}
