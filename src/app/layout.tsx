
import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import Navbar from '@/components/navbar';
import RouteFocus from '@/components/RouteFocus';
import { JokeProvider } from '@/contexts/JokeContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/components/theme-provider';
import { SITE_URL } from '@/lib/siteUrl';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const SITE_DESCRIPTION = 'Collect, filter and rate jokes. Yours and everyone else’s.';

export const metadata: Metadata = {
  // Without this, every relative URL below stays relative and an unfurler has
  // nothing to fetch — Next also warns about it during the build. It is the
  // resolved deployment origin, so a preview build advertises the preview.
  metadataBase: new URL(SITE_URL),
  title: {
    // Every route below sets its own title through this template. That is not
    // only 2.4.2: Next's App Router announcer speaks `document.title` on each
    // client-side navigation and skips it when the string has not changed, so
    // with one static title across seven routes it never announced anything.
    default: 'Joke Hub',
    template: '%s · Joke Hub',
  },
  description: SITE_DESCRIPTION,
  // Round 7 added a "Copy link" button whose entire purpose is pasting a joke
  // URL into a chat window. Until now that pasted as bare text: the document
  // carried no Open Graph tags whatsoever. These are site-level and inherited
  // by every route; a per-joke card needs the joke text at request time, which
  // is a data-layer change (see the deferrals in the round-8 plan).
  openGraph: {
    type: 'website',
    siteName: 'Joke Hub',
    title: 'Joke Hub',
    description: SITE_DESCRIPTION,
    url: '/',
    // The dimensions are the file's real ones, read from the PNG header. An
    // unfurler that trusts them and gets them wrong reserves the wrong box and
    // reflows the card once the bytes arrive.
    images: [{ url: '/logo.png', width: 1449, height: 324, alt: 'Joke Hub' }],
  },
  twitter: {
    // Not a large card. X crops one to roughly 1.91:1 and the wordmark is
    // 4.47:1, so a large card would slice the top and bottom off the only thing
    // in the image. The small square thumbnail letterboxes it instead, which
    // keeps the whole wordmark legible next to the title.
    card: 'summary',
    title: 'Joke Hub',
    description: SITE_DESCRIPTION,
    images: ['/logo.png'],
  },
  icons: {
    // Not `/logo.png`: a <link rel="icon"> is fetched raw, so the wordmark put
    // 209KB on every page load to render a 1449×324 image into a 16px square,
    // where it was an illegible sliver. An SVG mark is ~300 bytes and sharp at
    // every size. Swap in a designed 32×32/180×180 PNG pair here if one is ever
    // made; nothing else needs to change.
    icon: '/favicon.svg',
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
        className={`${geistSans.variable} antialiased flex flex-col min-h-screen`}
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
                className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
              >
                Skip to content
              </a>
              <Navbar />
              <RouteFocus />
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
