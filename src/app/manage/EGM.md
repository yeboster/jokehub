# manage

## Overview
The `/manage` route: bulk CSV import of jokes into the signed-in user's collection. Sources: `page.tsx` (client component) and `layout.tsx` (sets the metadata title `'Import jokes'`).

## Interface
- `default ManageJokesPage` in `page.tsx`. It renders `CSVImport`, loaded with `next/dynamic` (`@/components/csv-import`, `ssr: false`), with `onImport={useJokes().importJokes}`. It also links to `/add-joke`.
- `default ImportLayout` in `layout.tsx`. It sets `metadata.title = 'Import jokes'` and renders its children unchanged.

## Invariants
- Signed-out users are redirected to `/auth?redirect=/manage` once auth has loaded. Until then, and while redirecting, the page shows a loading state.
- The importer is not rendered until `loadingCategories` is false. The comment in `page.tsx` says imported rows create categories on the fly.

## Side Effects
- Firestore writes through `useJokes().importJokes`, which is called from inside `CSVImport` (both outside this subtree).
- Client navigation through `router.push`.

## Verification
- No colocated test file in this directory. Run the full suite: `npm test`
