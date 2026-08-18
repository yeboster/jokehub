
"use client";

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import Header from '@/components/header';
import { useJokes } from '@/contexts/JokeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import PageLoading from '@/components/PageLoading';

const CSVImport = dynamic(() => import('@/components/csv-import'), {
    ssr: false,
    loading: () => <PageLoading inline label="Loading the importer…" />,
});

export default function ManageJokesPage() {
    const { user, loading: authLoading } = useAuth();
    const { importJokes, loadingCategories } = useJokes();
    const router = useRouter();

    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/auth?redirect=/manage');
        }
    }, [user, authLoading, router]);
    
    if (authLoading || (!user && !authLoading)) {
        return <PageLoading label="Checking your sign-in…" />;
    }

    // Imported rows create categories on the fly, so wait until the user's
    // existing categories are known before offering the import.
    if (loadingCategories) {
      return <PageLoading label="Loading your categories…" />;
    }

    return (
        <div className="container mx-auto px-4 py-8 sm:px-6 md:py-12">
            <Header
              title="Import Jokes"
              description="Bring a CSV of jokes into your collection in one go."
            />

            <div className="max-w-4xl mx-auto">
                <CSVImport onImport={importJokes} />
                {/* Replaces the "About This Page" card, which spent a whole
                    Card explaining that this page is for bulk import and that
                    single jokes go elsewhere. One line, and the elsewhere is a
                    link. */}
                <p className="mt-6 text-center text-sm text-muted-foreground">
                    Adding one joke, or writing with the AI assistant?{' '}
                    <Link href="/add-joke" className="font-medium text-primary underline hover:text-primary/80">
                        Add a single joke
                    </Link>
                    .
                </p>
            </div>
        </div>
    );
}

    
