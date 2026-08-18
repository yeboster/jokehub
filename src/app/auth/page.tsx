
"use client";

import { useState, type FormEvent, useEffect, useRef, Suspense } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import PageLoading from '@/components/PageLoading';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

/**
 * The shape check the browser used to do for `type="email"` before `noValidate`
 * turned it off. Deliberately not a full validator — no regex is correct for
 * addresses, and Firebase is the real authority. This only catches the typo
 * ("abc", "you@example") that would otherwise come back as an unmapped
 * `auth/invalid-email` and print Firebase's own wording into the form.
 */
function looksLikeEmail(value: string): boolean {
  const at = value.indexOf('@');
  const dot = value.indexOf('.', at);
  return at > 0 && dot > at + 1 && dot < value.length - 1;
}

function AuthPageComponent() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // Field-level messages. The two "Validation Error" toasts these replace were
  // unreachable: `required` and `minLength` made the browser block the submit
  // before `handleSubmit` ever ran, so the copy written for the user was never
  // shown to the user.
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  // Only so a failed submit can put the caret where the problem is; `noValidate`
  // took the browser's focus-the-first-bad-field behaviour away with it.
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
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

    const nextErrors: { email?: string; password?: string } = {};
    if (!email.trim()) nextErrors.email = 'Enter your email address.';
    else if (!looksLikeEmail(email.trim())) nextErrors.email = 'That doesn’t look like an email address.';
    if (!password) nextErrors.password = 'Enter your password.';
    else if (password.length < 6) nextErrors.password = 'Passwords are at least 6 characters.';
    if (nextErrors.email || nextErrors.password) {
      setErrors(nextErrors);
      // Move to the first field at fault. The message itself is a live region,
      // but a screen-reader user left standing on the submit button would have
      // no way to reach the field the announcement is about.
      (nextErrors.email ? emailRef : passwordRef).current?.focus();
      return;
    }

    setErrors({});
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
        errorMessage = 'That email and password do not match an account.';
      } else if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'That email is already registered — try logging in instead.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'That doesn’t look like an email address.';
      }
      // Inline, not a toast: the failure belongs to this form, the form is the
      // only thing on the page, and a toast can be missed or dismissed while
      // the wrong password is still sitting in the field.
      setErrors({ form: errorMessage });
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
          <form onSubmit={handleSubmit} className="space-y-6" noValidate>
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                ref={emailRef}
                type="email"
                // Without these a password manager cannot recognise the form,
                // which is the single largest source of friction on a sign-in
                // page nobody visits twice a week.
                autoComplete="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setErrors((prev) => ({ ...prev, email: undefined, form: undefined })); }}
                placeholder="you@example.com"
                disabled={isLoading}
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? 'email-error' : undefined}
                className="text-base"
              />
              {/* `role="alert"` as on the form-level block below: with `noValidate`
                  nothing else speaks these messages aloud. */}
              {errors.email && <p id="email-error" role="alert" className="text-sm font-medium text-destructive">{errors.email}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  ref={passwordRef}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setErrors((prev) => ({ ...prev, password: undefined, form: undefined })); }}
                  placeholder="••••••••"
                  disabled={isLoading}
                  aria-invalid={!!errors.password}
                  // Only ever points at an element that is actually rendered:
                  // the hint exists on sign-up only, and a dangling idref is
                  // announced as nothing at all.
                  aria-describedby={errors.password ? 'password-error' : !isLogin ? 'password-hint' : undefined}
                  className="text-base pr-10"
                />
                <button
                  type="button"
                  // 40px square, inside the 40px-tall field.
                  className="absolute right-0 top-0 flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground outline-none ring-offset-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  disabled={isLoading}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password ? (
                <p id="password-error" role="alert" className="text-sm font-medium text-destructive">{errors.password}</p>
              ) : (
                !isLogin && <p id="password-hint" className="text-sm text-muted-foreground">At least 6 characters.</p>
              )}
            </div>
            {errors.form && (
              <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm font-medium text-destructive">
                {errors.form}
              </p>
            )}
            <Button type="submit" className="w-full text-base py-3" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLogin ? 'Log In' : 'Sign Up'}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col items-center space-y-2">
          <Button variant="link" onClick={() => { setIsLogin(!isLogin); setErrors({}); }} disabled={isLoading} className="text-sm">
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

    
