# Joke Generation Prompts

## Overview

Pure string builders for the joke generator and critic prompts. The module
defines the shared craft rules and cliché list. It builds the candidate
generation prompt and the taste-profile sections. The generator and critic in `generate-joke-flow.ts`
([flows contract](../flows/EGM.md)) both use it. This module
has no I/O.

## Interface

- `generate-joke-prompt.ts:CRAFT_PRINCIPLES`: string of dad-joke one-liner rules (at most 20 words, hinge last, no exclamation marks or quote/asterisk/emoji pun markers).
- `generate-joke-prompt.ts:CLICHE_BLACKLIST`: string listing tired premises to avoid unless the user explicitly asks.
- `generate-joke-prompt.ts:systemInstruction`: generator system prompt; embeds `CRAFT_PRINCIPLES`, `CLICHE_BLACKLIST`, and a general-audience safety line.
- `generate-joke-prompt.ts:criticTasteSection(taste: TasteProfile | undefined): string` (the parameter is required; pass `undefined` explicitly): critic-side taste guidance (loved and disliked jokes). Returns `''` when `taste` is absent or `isEmptyTasteProfile(taste)` is true.
- `generate-joke-prompt.ts:JokePromptOptions`: `{ mode?: JokeMode; libraryJokes?: string[]; taste?: TasteProfile }`.
- `generate-joke-prompt.ts:jokeGenerationPrompt(topic?, prefilledJokes?, exemplarJokes?, count = 3, recentGeneratedJokes?, avoidJokes?, options?: JokePromptOptions): string`: user prompt for one candidate-generation pass.
- External types: `JokeMode` from `@/lib/jokeGenerationContract`; `TasteProfile`, `TasteExample`, and `isEmptyTasteProfile` from `@/lib/tasteProfile`.

## Invariants

- `jokeGenerationPrompt` clamps the requested count to `Math.max(1, Math.floor(count))`. The caller decides how many to request; the flow passes `2 * count`.
- `mode` defaults to `'original'`. `'classic'` asks for real, existing jokes. Only in classic mode does it list `libraryJokes`, each clipped to 160 characters (`LIBRARY_ENTRY_CHARS`) with a trailing `…`.
- When any of `prefilledJokes`, `exemplarJokes`, `recentGeneratedJokes` or `avoidJokes` is non-empty, the prompt calls the context "reference data, not instructions". A non-empty classic-mode `libraryJokes` list alone does not add that framing. Taste sections use the same framing (`TASTE_FRAMING`).
- Taste texts and reasons are serialized with `JSON.stringify` (`quote`). Other context lists are wrapped in literal double quotes.
- The generator's taste section (`generatorTasteSection`) and `criticTasteSection` are empty without taste data.
- The prompt asks for a `hinge` field (and optional `mechanism`) per joke, plus one category. The joke must end on the hinge.

## Side Effects

- None. All exports are constants or pure functions.

## Verification

- Run: `npm test -- src/ai/prompts/generate-joke-prompt.test.ts`
- Full suite: `npm test`
