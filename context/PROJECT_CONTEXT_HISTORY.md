# Project Context History: Joke Hub

## 1. Project Overview

**App Name**: Joke Hub

**Core Goal**: A Next.js web application for users to manage, share, and rate jokes. It includes features for manual entry, CSV import, AI-assisted joke generation, and community-based joke rating.

**Tech Stack**:
*   Next.js (App Router, Server Components, Server Actions)
*   React (Functional Components, Hooks)
*   ShadCN UI components
*   Tailwind CSS
*   Genkit (for AI, v1.x API)
*   Firebase (Firestore for database, Firebase Auth for authentication)
*   TypeScript

**Styling Guidelines**:

All colors are HSL triples defined as CSS custom properties in `src/app/globals.css` (`:root` for light, `.dark` for dark) and consumed exclusively through Tailwind theme tokens (`bg-primary`, `text-muted-foreground`, …). Never hardcode a palette color (e.g. `bg-yellow-50`) — it will not adapt to dark mode.

*   **Primary — vibrant purple** `270 60% 50%` (≈`#6A0DAD`), `270 60% 65%` in dark. The brand color: primary buttons, links, focus rings, filled stars.
*   **Accent — pastel purple** `270 80% 95%` light / `270 50% 25%` dark, with `--accent-foreground` at the primary purple (`270 60% 50%` light, lightened to `270 60% 75%` in dark for contrast on the dark accent). Used for subtle tinted backgrounds (active nav item, file-input button). It is a *background* token — it has near-zero contrast on white as a text/fill color.
*   **Text scale — neutral grays**: `--foreground` `0 0% 20%` (#333333) light / `0 0% 98%` dark for body text, `--muted-foreground` `0 0% 40%` (#666666) light / `0 0% 63.9%` dark for subtitles and secondary text.
*   **Surfaces**: `--background`/`--card` white (`0 0% 100%`) light, near-black (`0 0% 10%`) dark; `--border`/`--input` `0 0% 89.8%` light, `0 0% 25%` dark.
*   **Destructive** `0 84.2% 60.2%` light / `0 62.8% 50.6%` dark (deepened so it doesn't glare on the near-black surface), `--destructive-foreground` `0 0% 98%` in both. Errors and delete actions.
*   **Typography**: Geist Sans / Geist Mono, loaded in `src/app/layout.tsx` via `next/font/google` and exposed as `--font-geist-sans` / `--font-geist-mono`; `tailwind.config.ts` maps them onto `fontFamily.sans`/`mono`, so Tailwind's preflight applies Geist Sans globally.
*   **Inline notices** follow the tinted-token idiom `bg-<token>/10 border-<token>/30 text-<token>` (e.g. `bg-destructive/10 border-destructive/30 text-destructive`), rendered via the `<Alert>` component.
*   Clean, organized, modern layout.

**The four scales (design round 4, 2026-08-18)**

One scale each for type, elevation, page container and motion. All four are also recorded as a comment block in `src/app/globals.css` (in the second `@layer base`, immediately after the `body` rule) — that comment is the copy to keep in sync with the code; this section is the narrative one.

*   **Type scale.** Applied at call sites, deliberately not as component classes, so the utilities stay greppable and Tailwind can see every variant.

    | Role | Classes |
    |---|---|
    | Page title (h1) | `text-3xl font-bold tracking-tight sm:text-4xl` |
    | Page description | `text-base text-muted-foreground sm:text-lg` |
    | Section title (h2) | `text-2xl font-semibold tracking-tight` |
    | Card title | `text-lg font-semibold` |
    | Body | `text-sm leading-relaxed` |

    Page titles come from the shared `src/components/header.tsx` (`title`, optional `description`, optional `centered`) — use it rather than hand-rolling an `<h1>`. ShadCN's `CardTitle` defaults to `text-2xl` and is always overridden at the call site; `src/components/ui/card.tsx` is left alone. Known stragglers are listed under round 4's round-5 deferrals in `PROJECT_PROGRESS.md`.

*   **Elevation scale.** Reserve heavy shadows for things that actually float.

    | Surface | Class |
    |---|---|
    | In-flow content card (grid item, detail-page section) | `shadow-sm`, `hover:shadow-md` |
    | Genuinely floating (dialog, popover, dropdown, toast) | `shadow-lg` |
    | Standalone focal card (auth) | `shadow-md` |

    `shadow-xl` is not in the scale. In dark mode shadows are invisible on the near-black surfaces, so separation comes from the `--card`/`--popover` lightness step (`0 0% 13%` over a `0 0% 10%` page) plus the border — never from elevation alone.

*   **Page container.** `container mx-auto px-4 py-8 sm:px-6 md:py-12`, plus any existing `max-w-*` (e.g. `max-w-3xl` on the joke detail page). Loading states use the same container with `flex flex-col justify-center items-center min-h-[calc(100vh-8rem)]` appended. `p-4 md:p-8` and `py-10 sm:py-16` are retired.

*   **Motion.** Tokens live in `tailwind.config.ts`; the policy lives in `src/app/globals.css`.
    *   Easings: `ease-emphasized` (`cubic-bezier(0.22, 1, 0.36, 1)`) for things entering, `ease-standard` (`cubic-bezier(0.4, 0, 0.2, 1)`) for state changes in place. Source them by name — or via `theme(transitionTimingFunction.standard)` in an arbitrary property — rather than repeating a curve.
    *   Durations: 150ms for colour/state changes, 200ms for elevation and transform on a card, 300ms for the theme-toggle icon, 320ms for a card entrance.
    *   Animations: `animate-card-enter` for mount entrances (stagger via `src/lib/motion.ts`, 40ms step, capped at 12 items) and `.skeleton-bar` for loading placeholders.
    *   **Every animation must have a reduced-motion path.** Use `motion-safe:` for anything that moves and `motion-reduce:transition-none` for a transition that should not run; if you add a new `animate-*` utility, add it to the `@media (prefers-reduced-motion: reduce)` block at the end of `globals.css`. That block is unlayered and last in the file on purpose, and its selectors are doubled (or tripled, for Radix `data-[state]` utilities) to outrank the utilities they override. `animate-spin` is intentionally exempt: a frozen spinner reads as a hung request.
    *   Do not add `animate-shimmer` to an element that already has `.skeleton-bar`, and do not remove `disableTransitionOnChange` from `src/app/layout.tsx` — both are commented at the code site.

> Historical note: the original guideline specified dark gray `#333333` primary, medium gray `#666666` secondary, and purple `#800080` accent. The implementation deliberately promoted purple to *primary* and demoted the grays to the text scale; the description above reflects the shipped design and supersedes the original.

## 2. Key Features Implemented & Major Developments

### 2.1. Authentication
*   User registration (email/password) and login functionality.
*   `AuthContext` for managing user state globally.
*   Protected routes and UI adjustments based on auth state.
*   Redirection to auth page with redirect-back query parameter.

### 2.2. Joke Management (CRUD & Core Functionality)
*   **Adding Jokes**:
    *   Manual entry via `/add-joke` page using `AddJokeForm`.
    *   Form includes fields for joke text, category (creatable combobox), and owner's funny rate.
    *   AI-assisted joke generation:
        *   `/add-joke` page has an "AI Assistant" card.
        *   Users can provide an optional topic hint.
        *   `generate-joke-flow.ts` (Genkit flow) handles joke and category suggestion.
        *   `/api/generate-joke` route to trigger the flow.
        *   Generated joke and category pre-fill the `AddJokeForm`.
*   **Viewing Jokes**:
    *   **Joke List Page (`/jokes`)**:
        *   Displays jokes using `JokeListItem` cards.
        *   Comprehensive filtering:
            *   Scope: "All Jokes" (public) or "My Jokes" (user-specific, if logged in).
            *   Categories (multi-select from available categories based on scope).
            *   Funny Rate (owner's initial rating).
            *   Used/Unused status.
        *   Lazy loading/pagination ("Load More Jokes").
    *   **Joke Detail Page (`/joke/[jokeId]`)**:
        *   Displays full joke text, category, date added, and author (generic "You" or "A user").
        *   Layout updated to match mockup design (prominent joke text, separate cards for rating and community feedback).
        *   Accessible to unauthenticated users for public jokes.
*   **Editing Jokes (`/edit-joke/[jokeId]`)**:
    *   Allows owners to edit joke text, category, owner's funny rate.
    *   Includes a `Switch` component to toggle the `used` status of the joke.
    *   Form pre-filled with existing joke data.
*   **CSV Import (`/manage` page)**:
    *   Allows logged-in users to import jokes from a CSV file.
    *   Expected CSV columns: `text`, `category`. Optional: `funnyrate`.
    *   `CSVImport` component handles file parsing and calls `importJokes` in `JokeContext`.
    *   New categories from CSV are automatically created for the user.
*   **Home Page (`/`)**:
    *   Displays the latest 3 public jokes using the `JokeListItem` component for a consistent look.

### 2.3. Rating System
*   **Submitting/Updating Ratings**:
    *   Logged-in users can rate jokes (1-5 stars) and add an optional text comment on the joke detail page (`/joke/[jokeId]`).
    *   `StarRating` component used for input.
    *   `ratingService.ts` handles Firestore interactions for creating/updating ratings in the `jokeRatings` collection.
    *   Joke document in Firestore is updated with `averageRating` and `ratingCount` after each rating submission/update.
*   **Displaying Ratings**:
    *   **Joke Detail Page (`/joke/[jokeId]`)**:
        *   "Your Rating" section shows the logged-in user's current rating and comment for the joke (if any) and allows updates.
        *   "Community Feedback" section:
            *   Displays an overall "Average Rating" for the joke (stars, numerical value) calculated from all `jokeRatings` documents. (Note: Count display next to average stars was removed from detail page as per later mockup interpretation).
            *   Lists ratings and comments from *other* users (read-only).
    *   **Joke List Page (`/jokes`)**:
        *   `JokeListItem` cards display the `averageRating` for each joke (read-only stars).
        *   If no ratings, "No ratings yet" is displayed. Rating count text was removed from here.
*   **Data Migration**:
    *   `migrations/001-owner-ratings-to-joke-ratings.ts`: A Firestore migration script was created to:
        *   Migrate existing `funnyRate` (owner's rating) from `jokes` documents to new documents in the `jokeRatings` collection for the joke owner.
        *   Calculate and update `averageRating` and `ratingCount` on existing `jokes` documents based on the new `jokeRatings` collection.

### 2.4. Context Management
*   **`JokeContext`**:
    *   Manages global state for jokes and categories.
    *   Handles fetching jokes with filters, pagination, adding, importing, updating (text, category, used status, owner's rate), and getting individual jokes.
    *   Manages user-specific and public categories.
    *   Integrates `ratingService` functions for submitting ratings and fetching all ratings for a joke.
*   **`AuthContext`**: Manages user authentication state and provides auth functions.

### 2.5. UI/UX Enhancements & Fixes
*   Consistent use of ShadCN UI components and Tailwind CSS.
*   Theme colors (primary: dark gray, secondary: medium gray, accent: purple) applied via `globals.css`.
*   Responsive Navbar with links based on auth state.
*   Toast notifications for user feedback (success, errors).
*   Loaders for asynchronous operations.
*   Error handling and graceful display (e.g., `UserCircle` icon import fix).
*   Improved layout on various pages (e.g., joke detail page, home page).
*   Removal of redundant "My Jokes" page, merging functionality into the main "Jokes" page with a scope filter.
*   Adjusted `JokeListItem` to remove owner rating, then display average rating, and finally refine the average rating display (no count, "No ratings yet" if applicable).

## 3. Current Status & Focus
The application has a robust set of features around joke management and rating. We have just completed refining the display of average ratings on `JokeListItem` cards to show "No ratings yet" when applicable and remove the explicit rating count text. The current immediate task is the creation of these context persistence files.

## 4. Next Steps
*   (User to define subsequent tasks for the Joke Hub application after these context files are created).

## 5. Important Decisions & Constraints
*   The tech stack (Next.js, React, ShadCN, Tailwind, Genkit, Firebase) is fixed.
*   Genkit v1.x API is used for AI features.
*   Firebase Rules are in place for security.
*   Placeholder images are used via `https://placehold.co`.
*   Lucide React icons are preferred.
*   Proceeding with development one step at a time to avoid getting stuck.
