# Contributing

Thank you for improving Book Walker Marker Plus. Contributions should stay focused, preserve user
data and respect the reader integration's safety constraints.

## Before you start

- Search existing issues and pull requests before opening a duplicate.
- Discuss large features or architecture changes in an issue first.
- Never include API keys, Notion tokens, copyrighted book text or other private data in an
  issue, fixture, screenshot or commit.
- Keep changes scoped to the problem being solved; avoid unrelated refactors.

## Local setup

Install Node.js 22 or newer, enable Corepack and install the locked dependencies:

```bash
corepack enable
pnpm install --frozen-lockfile
```

Run the development extension with:

```bash
pnpm dev
```

Load `build/chrome-mv3-dev` as an unpacked extension in Chrome. After a rebuild, reload the
extension on `chrome://extensions` and then refresh the reader tab.

## Required checks

Run the same checks used by CI before opening a pull request:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm package
pnpm verify:package
```

A change is not ready when any command fails or when tests are skipped unexpectedly. Add a
focused regression test for bug fixes and tests for both valid and invalid inputs when adding
validation.

## Architecture constraints

- Storage and LLM network calls belong in the background worker. Content scripts only own UI
  and message relaying.
- Never write markers back to the Book Walker account.
- Store API keys and Notion tokens in `chrome.storage.local`, not sync storage.
- Keep strict TypeScript types. Do not introduce `any` or unvalidated loose dictionaries.
- Keep exactly two entry files in `src/contents/`; helpers belong in `src/viewer/`.
- Preserve `bookId`, `sidx`, `eidx` and font-profile-aware locator data on marker records.
- Request optional host permissions directly from a user gesture, before awaiting anything.

Read [`CLAUDE.md`](CLAUDE.md) before changing reader integration, messaging, providers,
internationalization or marker locators.

## Style

- Write source comments and project documentation in English.
- Explain purpose and non-obvious constraints rather than restating syntax.
- Preserve functional CJK content in locale catalogues, localized Notion schema aliases,
  Book Walker label matching and language-specific tests.
- Add user-facing strings to `locales/en/messages.json` first, then update every locale.
- Follow the existing formatting and naming conventions; do not reformat unrelated files.

## Pull requests

A pull request should include:

- a concise description of the problem and solution;
- linked issues where applicable;
- the exact verification commands and their results;
- screenshots or a short recording for visible UI changes;
- notes about permissions, storage migration, privacy or compatibility impact.

By submitting a contribution, you agree that it is licensed under the repository's
[`AGPL-3.0-only`](LICENSE) license.
