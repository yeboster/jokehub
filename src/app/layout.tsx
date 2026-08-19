
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import Navbar from '@/components/navbar';
import { JokeProvider } from '@/contexts/JokeContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/components/theme-provider';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Joke Hub',
  description: 'Manage and filter your jokes',
  icons: {
    icon: '/logo.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning={true}>
      <body 
        className={`${geistSans.variable} ${geistMono.variable} antialiased flex flex-col min-h-screen`}
        suppressHydrationWarning={true}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AuthProvider>
            <JokeProvider>
              {/*
                First focusable thing in the document, invisible until it takes
                focus. Without it every page and every client-side navigation
                costs up to seven tab presses (logo, three nav links, account
                menu, theme toggle) before the content starts.

                `focus:` rather than `focus-visible:`: a skip link is never
                clicked, so there is no mouse-focus case to suppress. `fixed`
                (not `absolute`) so it is visible even when the page is scrolled,
                and `z-[60]` because the nav is sticky at `z-50`.
              */}
              <a
                href="#main-content"
                className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                Skip to content
              </a>
              <Navbar />
              {/*
                `tabIndex={-1}` makes this a programmatic focus target — for the
                skip link above (some browsers park focus on the fragment's
                *container* only if it is focusable) and for the route-change
                focus reset. `outline-none` because that focus is never the
                user pointing at this element.
              */}
              <main id="main-content" tabIndex={-1} className="flex-grow outline-none">
                 {children}
              </main>
              <Toaster />
            </JokeProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
