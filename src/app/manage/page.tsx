
"use client";

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import Header from '@/components/header';
import { useJokes } from '@/contexts/JokeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import PageLoading from '@/components/PageLoading';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

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
            <Header title="Manage Your Jokes" />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
                <div className="md:col-span-2"> {/* Allow CSVImport to take full width if it's the main component */}
                  <CSVImport onImport={importJokes} />
                </div>
            </div>
             <Card className="mt-8 max-w-4xl mx-auto">
                <CardHeader>
                    <CardTitle>About This Page</CardTitle>
                </CardHeader>
                <CardContent>
                    <CardDescription>
                        This page is dedicated to managing your jokes through bulk operations like CSV import. 
                        To add individual jokes or generate them with AI, please use the &quot;Add New Joke&quot; button on the main &quot;Jokes&quot; page.
                    </CardDescription>
                </CardContent>
            </Card>
        </div>
    );
}

    
