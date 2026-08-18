
"use client";

import { useState, type FormEvent, useEffect, Suspense } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import PageLoading from '@/components/PageLoading';
import { Loader2 } from 'lucide-react';

function AuthPageComponent() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const { signIn, signUp, user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const redirectPath = searchParams.get('redirect') || '/jokes'; // Default redirect to /jokes

  useEffect(() => {
    if (!authLoading && user) {
      router.push(redirectPath);
    }
  }, [user, authLoading, router, redirectPath]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
        // Still unreachable — `required` on the inputs makes the browser block
        // the submit before this runs. Task 16 replaces both with inline field
        // messages; retitled here only so the voice rule holds everywhere.
        toast({ title: "Couldn't submit", description: 'Email and password are required.', variant: 'destructive'});
        return;
    }
    if (password.length < 6) {
        toast({ title: "Couldn't submit", description: 'Password must be at least 6 characters long.', variant: 'destructive'});
        return;
    }
    setIsLoading(true);
    try {
      if (isLogin) {
        await signIn(email, password);
      } else {
        await signUp(email, password);
      }
      toast({
        title: isLogin ? 'Signed in' : 'Account created',
        description: isLogin ? 'Taking you back…' : 'Welcome to Joke Hub.',
      });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Firebase auth errors expose a dynamic `code` field not present on Error.
    } catch (error: any) {
      console.error("Auth error:", error);
      let errorMessage = error.message || (isLogin ? 'Failed to login.' : 'Failed to sign up.');
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        errorMessage = 'Invalid email or password.';
      } else if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'This email is already registered. Try logging in.';
      }
      toast({
        title: "Couldn't sign you in",
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (authLoading) {
    return <PageLoading label="Checking your sign-in…" />;
  }

  if (user) {
     return <PageLoading label="Signing you in…" />;
  }

  return (
    // The canonical page container (globals.css), with the centring moved onto
    // it. `items-start` rather than `items-center`: vertical centring fought
    // the container's own `py-*` and pushed the card below the fold on a short
    // phone viewport once the keyboard opened.
    <div className="container mx-auto px-4 py-8 sm:px-6 md:py-12 flex justify-center items-start">
      <Card className="w-full max-w-md shadow-md">
        <CardHeader className="text-center">
          {/*
            A real <h1>, not <CardTitle> (which is a <div>): this card is the
            whole page, so its title is the page's heading and the page had no
            h1 at all. The size is the documented section-title step — the
            card-title step would be smaller than the button below it.
          */}
          <h1 className="text-2xl font-semibold leading-none tracking-tight">
            {isLogin ? 'Login to Joke Hub' : 'Create Your Joke Hub Account'}
          </h1>
          <CardDescription>
            {isLogin ? 'Access your personal joke collection.' : 'Join to save and manage your jokes.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" disabled={isLoading} className="text-base"/>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" disabled={isLoading} minLength={6} className="text-base"/>
            </div>
            <Button type="submit" className="w-full text-base py-3" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLogin ? 'Log In' : 'Sign Up'}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col items-center space-y-2">
          <Button variant="link" onClick={() => setIsLogin(!isLogin)} disabled={isLoading} className="text-sm">
            {isLogin ? 'Don’t have an account? Sign Up' : 'Already have an account? Log In'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<PageLoading label="Loading the page…" />}>
      <AuthPageComponent />
    </Suspense>
  );
}

    
