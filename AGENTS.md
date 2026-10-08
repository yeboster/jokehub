# Agent guide

## Project

Jokehub is a Next.js App Router application built with React, strict TypeScript, Tailwind CSS, Radix UI primitives, Firebase, and Genkit. Use npm and the existing lockfile.

## Repository map

- `src/app/`: pages, layouts, and API route handlers.
- `src/components/`: feature components; `ui/` contains shared UI primitives.
- `src/contexts/`: authentication and joke state providers.
- `src/hooks/`: reusable client hooks, including feed filters and category subscriptions.
- `src/services/`: Firebase-facing data operations; `server/` contains server-side services.
- `src/lib/`: shared types, helpers, validation, and client/server infrastructure.
- `src/ai/`: Genkit flows, prompts, and model configuration.
- `migrations/` and `scripts/`: operational tooling, including Firestore deployment.
- `firestore.rules` and `firestore.indexes.json`: local sources of truth for Firestore rules and indexes.

The `@/` import alias resolves to `src/`.

## Local commands

| Command | Purpose |
| --- | --- |
| `npm ci` | Install dependencies from the lockfile. |
| `npm run dev` | Start the development server on port 9002. |
| `npm test` | Run the complete Vitest suite once. |
| `npm test -- src/path/example.test.tsx` | Run a focused test file. |
| `npm run lint` | Run ESLint. |
| `npm run typecheck` | Run TypeScript without emitting files. |
| `npm run build` | Build the production application. |

Read `package.json` for the current command definitions and `README.md` for environment and deployment details. Builds may load local environment configuration; do not expose its contents in logs or reports.

## Implementation conventions

- Keep changes focused on the requested behavior. Preserve unrelated work and avoid broad reformatting, dependency upgrades, or architecture changes without a clear need.
- Follow nearby code conventions and reuse existing components and helpers before adding abstractions or packages.
- Preserve Next.js client/server boundaries. Keep admin credentials and server-only operations out of client components and browser bundles.
- Feed filters are URL-derived through `src/lib/jokeFilters.ts` and `src/hooks/useJokeFilters.ts`. Preserve supported query parameters and round-trip behavior.
- Filter dialog edits are drafts: Apply commits them; Cancel or dismissal discards them. Preserve fields owned by controls outside the dialog.
- Preserve accessible names, keyboard behavior, focus restoration, disabled states, and loading/error/empty states when changing UI.
- Fractional rating glyphs must clip a full-sized filled SVG, not shrink the SVG to the fractional width.

## Lightweight TDD

Use short RED → GREEN → REFACTOR cycles for behavior changes:

1. **Scope:** State the intended behavior in one sentence. Read the nearest implementation and tests; identify the main regression risk.
2. **RED:** Add the smallest behavior test before changing production code. Run that test and confirm it fails for the intended reason, not missing dependencies, imports, or broken fixtures. Cover each distinct behavior; use table-driven cases for related boundaries.
3. **GREEN:** Make the smallest change that passes the test. Include the relevant edge or failure case and preserve neighboring behavior. Mock external boundaries, not the logic being tested.
4. **REFACTOR:** Clean up only if useful; keep focused tests green. Before risky refactors, add characterization tests for existing behavior.
5. **Prove regression protection:** For bug fixes and critical invariants, temporarily undo the essential fix in isolation and confirm the test fails; restore it and rerun. Never overwrite unrelated work or commit the temporary defect.
6. **Verify and commit:** Run affected tests, then the full code-change gates below once on the final candidate. Fix failures before creating the per-feature commit.

Keep this cheap: reuse existing test helpers; run a focused file or `-t` test-name filter during iteration; batch related cases. Avoid broad repository scans, large snapshots, new test frameworks, and extra agents for routine TDD. Save verbose logs outside the repository and report only the command, relevant failure, pass counts, and blockers. Reuse unchanged evidence within the same feature; rerun checks whose inputs changed. Never skip final gates to save tokens.

Documentation, generated artifacts, and purely declarative changes may use the nearest useful validation instead of a contrived failing test; state the exception. Never weaken assertions to make an implementation pass or claim TDD from a setup failure.

## Tests and verification

- Tests live alongside source as `*.test.ts` or `*.test.tsx`; script tests use `scripts/**/*.test.ts`.
- Vitest defaults to jsdom. Use `// @vitest-environment node` for suites requiring real Node request/response globals or server-only behavior.
- Existing component tests use React `act`, `react-dom/client`, and real UI primitives, mocking data subscriptions where needed. Prefer these patterns before adding a testing dependency.
- Assert observable behavior and effective accessibility wiring, not merely the presence of an attribute. For example, cmdk may generate `aria-labelledby` that takes precedence over an input's `aria-label`.
- jsdom does not prove visual layout. Distinguish DOM/style assertions from actual browser geometry or visual checks.
- Run focused tests while iterating. Before handing off code changes, run `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check` where the environment supports them.
- Report failed or unavailable checks explicitly. Do not weaken gates or claim live Firebase, browser, or screen-reader verification from unit tests.
- For documentation-only changes, check the documented commands and paths against the repository and inspect the diff; a full application build is not normally necessary.

## Safety and handoff

- Do not print, commit, or copy secrets from `.env*`, service-account files, or local credentials into reports or tests.
- Do not run migrations, `npm run firestore:deploy`, or `npm run firestore:push` without explicit authorization. These can change remote infrastructure; they are not ordinary verification commands.
- Avoid live Firebase writes and paid AI requests during testing unless specifically authorized. Prefer mocks or an explicitly configured emulator.
- Do not apply automatic dependency audit fixes as unrelated cleanup; report findings separately.
- Use subagents only when requested or otherwise explicitly authorized. Keep one writer per checkout, isolate concurrent writers, and keep reviewers read-only.
- After completing each feature and passing its applicable verification checks, create a focused commit with a descriptive message. Include only that feature's changes; preserve unrelated work. If verification is blocked or failing, report the blocker rather than committing the feature as complete.
- Push or deploy only when explicitly authorized; the per-feature commit requirement does not authorize either. Never force-push by default.
- Summarize changed behavior, checks performed, remaining limitations, and Git status. Keep temporary logs and agent reports outside tracked product files.
