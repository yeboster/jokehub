# Feature Components (`src/components`)

## Overview

This directory holds the app's feature components: the add-joke form, a category combobox that can create new categories, CSV import, the joke list and its cards, the navbar, an accessible star rating, route focus management, loading and empty states, and theming. Feature subdirectories hold the joke detail page, the feed filter dialog and the AI joke studio. `ui/` holds the shared primitives. Persistence happens in callback props or in contexts and hooks outside this directory. No direct file here imports a service module.

## Interface

`"use client"` is present in every direct file except `EmptyState.tsx`, `header.tsx` and `PageLoading.tsx`.

- `AddJokeForm` (default): props `onAddJoke: (data: JokeFormValues) => Promise<void>`, `prefill?: JokeFormPrefill | null`, `onPrefillApplied?: (key) => void`. It also exports the types `JokeFormValues` and `JokeFormPrefill` (`{ key, text, category, source }`) [add-joke-form.tsx].
- `CategoryCombobox` (named and default, `forwardRef<HTMLButtonElement>`) and `CategoryComboboxProps`: props `value`, `onChange(category)`, `placeholder?`. Other `Button` props are forwarded to the trigger [CategoryCombobox.tsx].
- `CSVImport` (default): props `onImport: (jokes: Omit<Joke, 'id' | 'used' | 'dateAdded' | 'userId'>[]) => Promise<void>` [csv-import.tsx].
- `EmptyState` (default): props `icon`, `title`, `hint?`, `action?`, `className?`, `size?: 'default' | 'sm'`, `titleAs?: 'p' | 'h1' | 'h2'` [EmptyState.tsx].
- `Header` (default): props `title`, `description?`, `centered?` [header.tsx].
- `JokeListItem` (default): props `joke: Joke`, `index?` [joke-list-item.tsx].
- `JokeList` (default): props `jokes`, `emptyCopy?: FeedEmptyCopy`, `onClearFilters?`, `onRetry?` [joke-list.tsx].
- `Logo` (default): props `width`, `className?`, `priority?`, `alt?` (default `'Joke Hub'`) [logo.tsx].
- `Navbar` (default): no props [navbar.tsx].
- `PageLoading` (default): props `label`, `inline?`, `className?` [PageLoading.tsx].
- `RouteFocus` (default): no props; renders `null` [RouteFocus.tsx].
- `StarRating` (default): props `rating`, `onRatingChange?`, `maxStars?` (5), `size?` (20), `className?`, `starClassName?`, `disabled?`, `readOnly?`, `label?`, `describedBy?` [StarRating.tsx].
- `ThemeProvider` and `ThemeToggle` (named) [theme-provider.tsx, theme-toggle.tsx].
- Subdirectory contracts:
  - [joke](./joke/EGM.md): joke detail page components.
  - [jokes](./jokes/EGM.md): `JokeFilterDialog`, the feed filter draft dialog.
  - [joke-studio](./joke-studio/EGM.md): AI generation controls, generated batches, the samples panel and the taste panel.
  - [ui](./ui/EGM.md): shared Radix, cmdk and react-hook-form primitives.

## Invariants

- Add-joke validation. `jokeFormSchema` requires `text` with `min(1)` and `category` with `trim().min(1)`. `source` is optional with `max(100)`; a code comment says this mirrors the source size limit in `firestore.rules` [add-joke-form.tsx:jokeFormSchema].
- Add-joke disabled state:
  - Fields are disabled when `!user || isSubmitting`. Loading categories is deliberately left out of this condition.
  - The submit button is also disabled while `loadingCategories`. [add-joke-form.tsx:isFormDisabled]
- Add-joke save result. The form resets only after `onAddJoke` resolves, and keeps the fields when it rejects. The root error renders as `<p role="alert">` [add-joke-form.tsx:onSubmit].
- Add-joke prefill:
  - A prefill with a new key is applied only once.
  - It is dropped while submitting.
  - If the fields are dirty, an `AlertDialog` asks before replacing them.
  - Applying it resets the form, focuses the text field, and calls `onPrefillApplied(key)`.
  - When the dialog closes, focus goes to the text field after Replace and to the previously focused element after Keep editing. [add-joke-form.tsx]
- Category combobox:
  - Filtering is manual (`shouldFilter={false}`): a case-insensitive substring match.
  - When no category matches the term exactly (case-insensitive), a "Create" option for the term is listed first.
  - The trigger is disabled while categories load and has `role="combobox"` with `aria-expanded`.
  - The search resets to the committed value each time the popover opens. [CategoryCombobox.tsx]
- CSV parsing:
  - A header row and at least one data row are required.
  - The `text` and `category` columns are required. `funnyrate` and `source` are optional; header names are trimmed and lowercased.
  - A row is skipped, with its line number and reason, when its text or category is empty or its source is longer than `MAX_SOURCE_LENGTH = 100`.
  - `funnyrate` is accepted only in the range 0 to 5 and defaults to 0 otherwise.
  - `onImport` is called only when at least one row is valid. [csv-import.tsx]
- CSV file input. It is disabled when `!user || isLoading`, and its value is cleared after every attempt. The `role="status"` element is always mounted [csv-import.tsx].
- Joke card:
  - The "Used" badge shows only to the joke's owner (`joke.used && currentUser.uid === joke.userId`).
  - The rating label is "Average rating X.X out of 5, from N rating(s)". [joke-list-item.tsx]
- Joke list empty state. It offers "Try again" when `copy.offerRetry && onRetry`, otherwise "Clear filters" when `copy.offerClearFilters && onClearFilters` [joke-list.tsx].
- Navbar:
  - The nav has `aria-label="Main"`.
  - The `/manage` link shows only to signed-in users.
  - The Login link is hidden on `/auth`. [navbar.tsx]
- Route focus. On a pathname change, but not on first render, `RouteFocus` calls `document.getElementById('main-content')?.focus({ preventScroll: true })`. It depends only on the pathname, so query-string changes do not move focus [RouteFocus.tsx].
- Star rating fill:
  - Each star's fill is `min(max(value - i, 0), 1) * 100`.
  - A fractional star clips a full-size filled `Star` (`flexShrink: 0`) inside an `overflow-hidden` span with a percentage width. The SVG is not shrunk. [StarRating.tsx:StarGlyph]
- Star rating roles. Read-only mode is one `role="img"` with an `aria-label` derived from the rating. Interactive mode is a `role="radiogroup"` of `role="radio"` buttons with a roving tabindex. Arrow and other keys go through `ratingFromKey` and move focus to the new star [StarRating.tsx].
- Other accessibility. `PageLoading` has `role="status"`. `EmptyState` has no live role. `ThemeToggle` has the sr-only label "Toggle theme" [PageLoading.tsx, EmptyState.tsx, theme-toggle.tsx].

## Side Effects

- `useAuth` (`@/contexts/AuthContext`) is used by `AddJokeForm`, `CSVImport`, `JokeListItem` and `Navbar`. `Navbar` calls `signOutUser` [add-joke-form.tsx, csv-import.tsx, joke-list-item.tsx, navbar.tsx].
- `AddJokeForm` reads `loadingCategories` from `useJokes` (`@/contexts/JokeContext`). It does not call `addJoke` [add-joke-form.tsx].
- `CategoryCombobox` reads `categoryNames` and `loadingCategories` from `useUserCategories` (`@/hooks/useUserCategories`) [CategoryCombobox.tsx].
- `CSVImport` reads the file with `FileReader.readAsText`, parses it with `parseCSVLine` (`@/lib/csv`) and `summarizeImport` (`@/lib/csvReport`), shows toasts through `useToast` (`@/hooks/use-toast`), and logs `console.warn` for skipped rows [csv-import.tsx].
- `ThemeToggle` calls `setTheme('light' | 'dark' | 'system')` from `next-themes` [theme-toggle.tsx].
- `RouteFocus` moves DOM focus to `#main-content` [RouteFocus.tsx].
- `AddJokeForm`, `CSVImport`, `JokeList` and `StarRating` call their callback props. The parents perform persistence.

## Verification

- Run: `npm test -- src/components` (focused) or `npm test`.
