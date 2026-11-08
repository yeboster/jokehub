# Feed Filter Dialog (`src/components/jokes`)

## Overview

`JokeFilterDialog` is the feed's Filters toolbar button (a Radix `DialogTrigger`) together with the dialog it opens. The dialog edits a draft of `FilterParams`: a multi-select of categories (a cmdk combobox in a popover, with removable chips), a rating bucket, and a usage status that only signed-in users see. Changes are committed only through `onApply`. The filter state itself is URL-derived, through `src/lib/jokeFilters.ts` and `src/hooks/useJokeFilters.ts`, both outside this directory.

## Interface

- `JokeFilterDialog` (default export, `"use client"`): props `value: FilterParams`, `onApply: (filters: FilterParams) => void`, `triggerRef?: Ref<HTMLButtonElement>` [JokeFilterDialog.tsx].

## Invariants

- Each open re-seeds the draft from `value`, copying `selectedCategories` into a new array, and resets the category search [JokeFilterDialog.tsx:openDialog].
- Cancel and dismissal only close the dialog. The draft is discarded [JokeFilterDialog.tsx:handleOpenChange].
- Apply calls `onApply` with the draft, then closes the dialog. Before the call it drops selected categories that are not in `categoryNames`, except while `loadingCategories` is true [JokeFilterDialog.tsx:handleApply].
- "Clear filters" resets only the draft's categories, rating (`ANY_RATING`) and usage status (`'all'`). It keeps the other draft fields and does not apply anything [JokeFilterDialog.tsx].
- The categories row renders only when `loadingCategories || categoryNames.length > 0`. Its trigger is disabled when `loadingCategories || categoryNames.length === 0`. The trigger has `role="combobox"` and `aria-expanded` [JokeFilterDialog.tsx].
- Category filtering is manual (`shouldFilter={false}`): a case-insensitive substring match on the trimmed query. `CommandInput` has `aria-label="Search categories"` [JokeFilterDialog.tsx:visibleCategories].
- Each chip's remove button has `aria-label` `Remove category ${category}` [JokeFilterDialog.tsx].
- The rating options are `[ANY_RATING, UNRATED, 1..5]`, labelled through `ratingBucketLabel`. The chosen value is parsed with `Number.parseInt(rate, 10)` [JokeFilterDialog.tsx].
- The usage-status `RadioGroup` renders only when `user` is truthy [JokeFilterDialog.tsx].
- When `hasActiveFilters(value)` is true, the trigger shows an `aria-hidden` dot and the sr-only text " (active filters)". `triggerRef` is forwarded to the trigger button [JokeFilterDialog.tsx].

## Side Effects

- Reads `categoryNames` and `loadingCategories` from `useUserCategories` (`@/hooks/useUserCategories`) [JokeFilterDialog.tsx].
- Reads `user` from `useAuth` (`@/contexts/AuthContext`) and does not mutate it [JokeFilterDialog.tsx].
- Calls the `onApply` prop.

## Verification

- Run: `npm test -- src/components/jokes/JokeFilterDialog.test.tsx` (focused) or `npm test`.
