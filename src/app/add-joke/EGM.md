# add-joke

## Overview
The `/add-joke` route, called the "joke studio" in the UI. It has a manual add-joke form and an AI assistant that generates batches of jokes, which the user can save, edit, vote on, or add as samples. Sources: `page.tsx` (client component) and `layout.tsx` (sets the metadata title `'Add a joke'`).

## Interface
- `default AddJokePage` in `page.tsx`. It gates on `useAuth()` and renders `AddJokeSession` with `key={user ? 'uid:<uid>' : 'signed-out'}`.
- Module-private components:
  - `AddJokeSession`: redirects signed-out users to `/auth?redirect=/add-joke` and shows an "Access Denied" card.
  - `JokeStudio({ user })`: the main studio.
- `default AddJokeLayout` in `layout.tsx`. It sets `metadata.title = 'Add a joke'` and renders its children unchanged.
- Hooks and modules the studio uses:
  - Contexts: `useJokes().addJoke`.
  - Hooks: `useStudioBatches(uid)`, `useGenerationFeedback(user)`, `useJokeSamples(user)`, `useJokeGeneration(user, onResult)`, `useRememberedModel()`.
  - Components: `AddJokeForm`, `GenerationControls`, `GeneratedBatch`, `SamplesPanel`, `TastePanel`.
- Saved jokes created from generated cards use the source `AI_SOURCE = 'AI Assistant'`.

## Invariants
- The session component is keyed by uid, so a user change remounts the studio and its local state.
- When a previously signed-in user signs out, `clearAllStoredBatches(sessionStorageOrNull())` drops the batches kept in this tab.
- A card can be saved only while its status is `'idle'` and no save is in flight for it (the `saving` ref set).
- Feedback writes for each card are serialized through `feedbackQueue`. Each write sends the card's full desired state from `desiredFeedback`.
- Optimistic vote and reason changes are rolled back on failure only when no later change has replaced them (the `feedbackOps` counter).
- Clicking the active vote again clears it (`vote: null`). Changing the vote drops the reason.
- A reason is recorded only while a vote is set.
- An edit link moves to a card only after the form reports that it applied the prefill (`handlePrefillApplied`).
- A direct save of a card ends any edit linked to that card.
- Edit on a generated card is ignored while the form is saving: `handleEdit` returns early when `formSaving` is set, and `GeneratedBatch` gets `editLocked={formSaving}`.
- A successful save shows a "Joke saved" toast whose `ToastAction` links to `/joke/<id>`.
- `handleFormSave` deliberately re-throws on failure, so `AddJokeForm` does not reset and the user keeps their text. While the form saves, its linked card is marked `'saving'`.
- A save of the edited text records feedback for the edited text. An unchanged save joins the card's own feedback queue.
- When the server reports feedback removed or reset, the matching cards' local votes and reasons are cleared (`forgetFeedback`).
- The generation status live region (`role="status"`) is always mounted, so text changes are announced.
- Framer-motion animations run under `MotionConfig reducedMotion="user"`.

## Side Effects
- Firestore write through `useJokes().addJoke` (outside this subtree).
- Network calls through the hooks: generation (`/api/generate-joke`), feedback (`/api/generated-joke-feedback`) and samples (`/api/joke-samples`). This page calls the hooks, not `fetch` directly.
- `sessionStorage` cleared through `clearAllStoredBatches` on sign-out. Batch persistence itself is handled by `useStudioBatches`.
- Toasts through `useToast`, and client navigation through `useRouter().push`.

## Verification
- Focused: `npm test -- src/app/add-joke/page.test.tsx`
- Full: `npm test`
