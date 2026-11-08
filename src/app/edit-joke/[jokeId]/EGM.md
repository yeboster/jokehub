# edit-joke/[jokeId]

## Overview
The `/edit-joke/[jokeId]` route: an owner-only form for editing or deleting a joke. Sources: `page.tsx` (client component) and `layout.tsx` (sets the metadata title `'Edit joke'`).

## Interface
- `default EditJokePage` in `page.tsx`. It reads `jokeId` from `useParams()`.
- `default EditJokeLayout` in `layout.tsx`. It sets `metadata.title = 'Edit joke'` and renders its children unchanged.
- `editJokeFormSchema` (zod, module-private), used through `react-hook-form` and `zodResolver`:

  | Field | Rule | Default |
  | --- | --- | --- |
  | `text` | string, at least 1 character | none |
  | `category` | string, trimmed, at least 1 character | none |
  | `source` | optional string | none |
  | `funnyRate` | number in `[0, 5]` | `0` |
  | `used` | optional boolean | `false` |

- Context functions used, from `useJokes()`: `getJokeById`, `updateJoke`, `deleteJoke`, `loadingCategories`.

## Invariants
- Signed-out users are redirected to `/auth?redirect=/edit-joke/<jokeId>`.
- Ownership is checked on the client: when `fetchedJoke.userId !== user.uid`, the page shows "You do not have permission to edit this joke." `onSubmit` checks ownership again before writing.
- A missing joke sets the error 'Joke not found.' and shows a "Couldn't load that joke" toast; a failed fetch sets 'Failed to load joke data.' and shows a toast. Both render the error card with a "Back to Jokes" button.
- A comment says the `funnyRate` range mirrors the `funnyRate >= 0 && funnyRate <= 5` create rule in `firestore.rules`. `0` means unrated.
- When nothing has changed, submitting shows a "Nothing to save" toast and navigates to `/jokes` without writing.
- On update failure:
  - An error message containing `'Category'` is set on the `category` field.
  - A message containing `'permission denied'` sets a root form error.
  - The form keeps every field.
- The delete `AlertDialog` cannot be dismissed while a delete is in flight. The action button calls `event.preventDefault()`, so the dialog stays open, and it stays open on failure.
- Form controls are disabled while auth, joke data or categories load, while a save or delete is in flight, or when a fetch error or ownership mismatch is present (`isFormDisabled`).

## Side Effects
- Firestore read through `getJokeById`, and writes through `updateJoke` and `deleteJoke`, all outside this subtree. The dialog copy says a delete also removes every rating on the joke; that happens in `jokeService.deleteJoke` ([services contract](../../../services/EGM.md)), not in this page.
- Toasts, and client navigation to `/jokes` or `/auth`.

## Verification
- Focused: `npm test -- 'src/app/edit-joke/[jokeId]/page.test.tsx'` (the "Nothing to save" check). Full suite: `npm test`
