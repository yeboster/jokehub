
"use client";

import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useJokes, type FilterParams } from '@/contexts/JokeContext';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowRight, Loader2, PlusCircle } from 'lucide-react';
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

export default function LandingPage() {
  const { user, loading: authLoading } = useAuth();
  const { jokes, loadJokesWithFilters, loadingInitialJokes } = useJokes();

  useEffect(() => {
    if (authLoading) return;
    loadJokesWithFilters(HOME_PAGE_FILTERS);
  }, [authLoading, loadJokesWithFilters]);

  // No placeholder jokes: the fallback used to render three fabricated jokes
  // whose ids resolve to nothing, so every click landed on "we couldn't find
  // the joke you're looking for". An empty feed says so instead.
  const displayedJokes = jokes ? jokes.slice(0, 3) : [];

  // `jokes` survives a reload now (see JokeContext), so the loading check is
  // the flag plus "no list yet" — never stale cards presented as fresh.
  const isLoading = authLoading || loadingInitialJokes || jokes === null;

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
        {isLoading ? (
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
