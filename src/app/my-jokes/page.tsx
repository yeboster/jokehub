
"use client";
// This page is no longer needed and will be deleted.
// Functionality has been merged into /src/app/jokes/page.tsx

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function MyJokesRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/jokes'); // Redirect to the main jokes page
  }, [router]);

  return (
    <div className="container mx-auto p-4 md:p-8 flex flex-col justify-center items-center min-h-[calc(100vh-8rem)]">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="mt-2 text-muted-foreground">Redirecting to Jokes page...</p>
    </div>
  );
}

    
