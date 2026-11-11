# app

## Overview
The Next.js App Router root. It holds the root layout (providers, navigation, skip link, toaster), the error and not-found boundaries, metadata routes (`robots.txt`, `sitemap.xml`), the landing page, and one subdirectory per route segment and API area.

## Interface
- `layout.tsx`:
  - `metadata` sets `metadataBase: new URL(SITE_URL)`, the title template `'%s · Joke Hub'` (default `'Joke Hub'`), `description: SITE_DESCRIPTION` (`'Collect, filter and rate jokes. Yours and everyone else’s.'`, also used in the Open Graph and Twitter blocks), Open Graph and Twitter `summary` cards using `/logo.png`, and the icon `/favicon.svg`.
  - It loads the `Geist` font as the CSS variable `--font-geist-sans` and applies it on `<body>`.
  - `default RootLayout` nests `ThemeProvider`, `AuthProvider` and `JokeProvider`. Inside them it renders a "Skip to content" link to `#main-content`, then `Navbar`, `RouteFocus`, `<main id="main-content" tabIndex={-1}>` and `Toaster`.
- `page.tsx`: `default LandingPage` (client). It loads exactly three public jokes with the module constant `HOME_PAGE_FILTERS` (`scope: 'public'`, `limit: 3`) and shows links that depend on sign-in state.
- `error.tsx`: `default RouteError({ error, reset })` (client). The error boundary for route segments. It shows the headline `ERROR_HEADLINE = 'Something went wrong.'` and a "Try again" button that calls `reset`.
- `global-error.tsx`: `default GlobalError({ error, reset })` (client). The boundary for errors in the root layout. It renders its own `<html>` and `<body>`, imports `./globals.css`, and has a button labelled "Reload" that calls `reset`; it does not reload the page.
- `not-found.tsx`: `default NotFound` (server component). It shows "That page doesn’t exist." and a link to `/jokes`.
- `robots.ts`: `default robots()`. It allows `/`, disallows `/api/`, `/add-joke`, `/edit-joke/`, `/manage` and `/auth`, and points to `${SITE_URL}/sitemap.xml`.
- `sitemap.ts`: `default sitemap()`. It lists exactly two entries: `${SITE_URL}/` (priority 1) and `${SITE_URL}/jokes` (priority 0.8), both with `changeFrequency: 'daily'`.
- Route segments:
  - [add-joke](./add-joke/EGM.md) - `/add-joke`. Joke studio: a manual form and AI batch generation.
  - [api](./api/EGM.md) - `/api/*` route handlers.
  - [auth](./auth/EGM.md) - `/auth`. Email/password log-in and sign-up.
  - [edit-joke](./edit-joke/EGM.md) - `/edit-joke/[jokeId]`. Owner-only edit and delete.
  - [joke](./joke/EGM.md) - `/joke/[jokeId]`. Joke detail, explanation and ratings.
  - [jokes](./jokes/EGM.md) - `/jokes`. The feed, with filters taken from the URL.
  - [manage](./manage/EGM.md) - `/manage`. CSV import.

## Invariants
- Client page segments set their `metadata.title` in a segment `layout.tsx` that renders its children unchanged. The comments say a client page cannot export metadata. The titles are:

  | Segment | Title |
  | --- | --- |
  | `add-joke` | `'Add a joke'` |
  | `auth` | `'Log in'` |
  | `edit-joke/[jokeId]` | `'Edit joke'` |
  | `joke/[jokeId]` | `'Joke'` |
  | `jokes` | `'Browse jokes'` |
  | `manage` | `'Import jokes'` |

- The joke list lives in `JokeProvider` in the root layout. The landing page and the feed each start their own fetch. They show a loading state until `loadedFilters` matches their own filters (`filtersEqual`), so jokes held from the other page are not shown.
- `RouteError` never renders `error.message`. It logs the error to the console and announces the headline through a `role="status"` region that mounts empty and is filled from an effect.
- `GlobalError` runs without the app's providers, so it has no theme and no font variable. Its comments say this is deliberate.
- `not-found.tsx` exports no `metadata`.
- The sitemap deliberately leaves out per-joke URLs and `lastModified`.

## Side Effects
- `page.tsx` reads Firestore through `useJokes().loadJokesWithFilters(HOME_PAGE_FILTERS)` once auth has loaded.
- `error.tsx` and `global-error.tsx` log with `console.error`.
- The providers in `layout.tsx` (`AuthProvider`, `JokeProvider`, `ThemeProvider`) are defined outside this subtree. Their side effects belong to `src/contexts/` and `src/components/`.

## Verification
- Full: `npm test`
- Focused tests in this subtree:
  - `npm test -- src/app/add-joke/page.test.tsx`
  - `npm test -- src/app/auth/page.test.tsx`
  - `npm test -- 'src/app/edit-joke/[jokeId]/page.test.tsx'`
  - `npm test -- src/app/api/generate-joke/route.test.ts`
  - `npm test -- src/app/api/generate-joke/route.integration.test.ts`
  - `npm test -- src/app/api/generated-joke-feedback/route.test.ts`
  - `npm test -- src/app/api/joke-samples/route.test.ts`
  - `npm test -- src/app/api/jokes/add/route.test.ts`
