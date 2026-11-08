# Joke Studio Components (`src/components/joke-studio`)

## Overview

These are the client components for the AI joke studio:

- `GenerationControls`: model, temperature, topic, mode, count, and the taste-profile toggle.
- `GeneratedBatch` and `GeneratedJokeCard`: collapsible batches of generated jokes. Each card supports vote, reason, add as sample, edit, and save.
- `SamplesPanel`: the samples list.
- `TastePanel`: the feedback (taste) list.

No file here calls `fetch` or a service directly. Every action goes through a callback prop, or through a hook API object (`JokeSamplesApi`, `GenerationFeedbackApi`) that the parent passes in.

## Interface

Every component file has `"use client"`.

- `GeneratedBatch.tsx`:
  - `modelLabel(model)` returns `GEMINI_MODEL_LABELS[model]` when `isGeminiModel(model)` is true, and `model` otherwise.
  - Type `CardHandlers`: `onSave`, `onEdit(batch, joke)`, `onVote(joke, vote)`, `onReason(joke, reason)`, `onAddSample`, `inSamples(text)`, `addingSample(text)`, `editLocked`.
  - Default `GeneratedBatch`: props `CardHandlers & { batch: StudioBatch; expanded: boolean; onToggle }`.
- `GeneratedJokeCard.tsx`: default `GeneratedJokeCard`. Props: `joke: StudioJoke`, `position`, `inSamples`, `addingSample`, `editLocked`, `onSave`, `onEdit`, `onVote`, `onReason`, `onAddSample`.
- `GenerationControls.tsx`:
  - `STUDIO_COUNTS = [3, 5] as const` and type `StudioCount`.
  - Default `GenerationControls`: controlled props for `model`, `temperature`, `topicHint`, `mode`, `count` and `useTasteProfile`, each with an `on*Change` callback, plus `isGenerating` and `onGenerate`.
- `SamplesPanel.tsx`: default `SamplesPanel`. Props: `samples: JokeSamplesApi`, a type from `@/hooks/useJokeSamples`.
- `TastePanel.tsx`: default `TastePanel`. Props: `feedback: GenerationFeedbackApi` (a type from `@/hooks/useGenerationFeedback`), `onRemoved(item)`, `onReset()`.

## Invariants

- Batch toggle:
  - The toggle has `aria-expanded={expanded}` and `aria-controls` set to `${batch.id}-jokes`.
  - A collapsed body stays mounted, with `hidden={!expanded}`.
  - When `batch.jokes.length < batch.requestedCount`, the batch shows a message that only some jokes passed the quality check. [GeneratedBatch.tsx]
- Card buttons:
  - Each thumbs button has an `aria-pressed` value that matches `joke.vote`.
  - Edit is disabled when `joke.status !== 'idle' || editLocked`.
  - Save is disabled while the status is `'saving'`.
  - "Add as sample" is disabled while `addingSample`. [GeneratedJokeCard.tsx]
- Card focus:
  - After Save, focus moves to the "View" link when the status becomes `'saved'`, and back to Save otherwise.
  - After Add sample, focus moves to the "In samples" marker when the joke is in samples, and back to the button otherwise. [GeneratedJokeCard.tsx:focusAfterSave, focusAfterSample]
- Card reason field: `ReasonField` renders only when `joke.vote` is set, with `maxLength = TASTE_LIMITS.reasonChars`. Enter or blur submits it, but only when `draft.trim() !== (joke.reason ?? '')` [GeneratedJokeCard.tsx:ReasonField].
- Generation controls:
  - Every control is disabled while `isGenerating`.
  - The temperature `Slider` uses `min=0`, `max=2`, `step=0.1` and `thumbLabel="Creativity (temperature)"`.
  - The count radio maps `'5'` to 5 and any other value to 3.
  - Model options come from `GEMINI_MODEL_CATALOG`; the trigger shows `getModelInfo(model).label` and the description line shows `getModelInfo(model).description` (`@/ai/models`). [GenerationControls.tsx]
- Samples panel:
  - `canAdd` requires all of: a truthy `normalizeJokeKey(text)`, `!api.isAdding(text)`, `!full`, and `status === 'ready'`.
  - `full` means `samples.length >= TASTE_LIMITS.maxSamples`.
  - The inputs are cleared only when `api.add` returns `'created'` or `'existing'`.
  - `maxLength` is `JOKE_GENERATION_LIMITS.contextTextChars` for the text and `TASTE_LIMITS.noteChars` for the note.
  - Per-sample controls are disabled while `api.pending.has(sample.id)`.
  - The text and note inputs are disabled while `full`. "Import my 5-star jokes" is disabled when `api.importing || full || status !== 'ready'`. [SamplesPanel.tsx]
- Taste panel:
  - The list toggle has `aria-expanded={open}` and `aria-controls={listId}`; the list is `hidden={!open}` and its items render only while open.
  - The Reset trigger is disabled when `api.resetting || status !== 'ready'`.
  - Reset requires confirmation in an `AlertDialog`, and `onReset` is called only when `await api.reset()` returns a truthy value.
  - `onRemoved` is called only when `await api.remove(item)` returns a truthy value.
  - The remove button is disabled while `api.removing.has(item.id)`. [TastePanel.tsx]
- Load errors: in both panels they render in a `role="alert"` box with a retry button [SamplesPanel.tsx, TastePanel.tsx].

## Side Effects

- `SamplesPanel` calls `api.add`, `api.importFiveStar`, `api.load`, `api.setActive` and `api.remove` [SamplesPanel.tsx].
- `TastePanel` calls `api.load`, `api.reset` and `api.remove`, then the `onReset` or `onRemoved` prop [TastePanel.tsx].
- `GeneratedJokeCard` links to `/joke/${joke.savedJokeId}` once the joke is saved. It moves focus with `element.focus()` [GeneratedJokeCard.tsx].
- `GeneratedBatch`, `GeneratedJokeCard` and `GenerationControls` call only their callback props. The parent performs persistence and generation.

## Verification

- Run: `npm test -- src/components/joke-studio` (focused; covers `SamplesPanel.test.tsx` and `TastePanel.test.tsx`) or `npm test`.
