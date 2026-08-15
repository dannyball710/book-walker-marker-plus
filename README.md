# Book Walker Marker Plus

Book Walker Marker Plus is an unofficial Chrome extension that replaces the browser reader's
built-in marker workflow with extension-managed highlights and notes. It also provides an
optional LLM chat scoped to the selected passage.

> [!IMPORTANT]
> The extension never writes markers back to your Book Walker account. Creating, editing or
> deleting a marker only changes the storage provider you selected. Existing account markers
> are neither modified nor imported.

This project is not affiliated with or endorsed by BOOK WALKER Co., Ltd.

## Features

- Highlights that follow page turns and font-size changes.
- Notes stored in local IndexedDB or a Notion database you control.
- Passage-scoped chat through OpenRouter, OpenAI or Gemini.
- Configurable prompt shortcuts with passage, note and book-title variables.
- Ruby annotations for Japanese readings and safe markdown rendering for model replies.
- English, Traditional Chinese and Japanese interfaces through `chrome.i18n`.
- Local-only secret storage and session-only chat history.

## Install a release

1. Download `book-walker-marker-plus-<version>-chrome.zip` from the repository's
   [Releases](../../releases) page.
2. Extract the ZIP to a permanent directory.
3. Open `chrome://extensions` and enable **Developer mode**.
4. Choose **Load unpacked** and select the extracted directory.
5. Pin the extension if you want quick access to its options.

The project is not currently distributed through the Chrome Web Store. Chrome does not load
this workflow's ZIP directly; extract it before choosing **Load unpacked**.

## Requirements

- Node.js 22 or newer
- pnpm 11.1.1 (pinned by the `packageManager` field)
- Chrome 114 or newer (required by `chrome.sidePanel`)

Corepack can install and select the pinned pnpm version:

```bash
corepack enable
pnpm install --frozen-lockfile
```

## Development

```bash
pnpm dev          # watch build in build/chrome-mv3-dev
pnpm typecheck    # TypeScript strict-mode checks
pnpm test         # run the Vitest suite once
pnpm build        # production build in build/chrome-mv3-prod
pnpm package      # package the production build as build/chrome-mv3-prod.zip
pnpm verify:package # verify every local file referenced by the built manifest
```

To run a development build, open `chrome://extensions`, enable **Developer mode**, choose
**Load unpacked**, and select `build/chrome-mv3-dev`.

> [!TIP]
> Reload the extension and then reload the reader tab after each rebuild. Neither content
> script applies to a tab that was already open, and refreshing the page alone does not pick
> up a rebuilt extension bundle.

## Architecture

The extension uses a background worker and two content-script worlds:

- `src/contents/viewer-bridge.ts` runs in the page's MAIN world. It intercepts the reader API,
  blocks native marker uploads and relays reader data over `window.postMessage`.
- `src/contents/viewer-ui.tsx` runs in Chrome's ISOLATED world. It owns selection UI,
  highlight reconciliation and background-message relaying.
- `src/background/` is the only layer that accesses storage providers or LLM APIs.
- `src/core/` contains strict, environment-independent domain logic.

The reader redraws highlights whenever its page DOM changes. The extension therefore
reconciles them continuously instead of drawing them once. Locator data is stored per font
profile because reader region indexes are not comparable across profiles.

See [`CLAUDE.md`](CLAUDE.md) for additional implementation constraints and architecture
notes.

## Configuration

Open settings from the side panel or right-click the extension icon and choose **Options**.

### Storage

The available storage providers are:

- `idb`: local IndexedDB and the default option.
- `notion`: a Notion database shared with an integration you control.

For Notion, create an internal integration, share the target database with it, and enter the
integration token. The settings page can search shared databases, inspect their schema and,
after explicit confirmation, create or repair the required properties. Repairing a property
with the wrong type can destroy data, so review the displayed changes before confirming.

The required Notion properties are:

`原文 (title)`, `備註 (rich_text)`, `書籍 (rich_text)`, `bookId (rich_text)`,
`markerId (rich_text)`, `epubcfi (rich_text)`, `capturedProfile (select)`,
`file (rich_text)`, `eFile (rich_text)`, `sidx (number)`, `eidx (number)`,
`position (rich_text)`, `byProfile (rich_text)`, `color (select)`, `progress (number)`,
`createdAt (date)`, `updatedAt (date)`.

The first three names are fixed schema identifiers rather than translated UI text. Changing
them would make existing databases incompatible.

Storage providers are never synchronized. Switching providers does not move records, and a
delete affects only the currently selected provider.

### LLM

Supported providers are OpenRouter, OpenAI and Gemini. Each provider accepts an API key and
model, with optional reasoning effort where the API supports it.

The provider hosts are optional Chrome host permissions. Save the settings and accept the
permission prompt before making a request. Loading a model list requests the same permission
from its button because Chrome requires permission requests to remain on the user gesture's
call stack. A custom base URL requires permission for its own origin.

### Prompt shortcuts

The response-language text setting defaults to Chrome's interface language and controls the
built-in assistant instruction. It can be changed to any language name. Prompt buttons
support these variables:

- `{{text}}`: selected passage
- `{{memo}}`: marker note
- `{{bookTitle}}`: current book title
- `{{responseLanguage}}`: configured response language

## Ruby annotations and markdown

Notes and model replies support `{漢字|かんじ}`, rendered as
`<ruby>漢字<rt>かんじ</rt></ruby>`. Editing shows the source syntax; leaving the field shows
the rendered reading. Prefix `{` with a backslash to escape it.

Model replies also support markdown. Rendering walks `marked` tokens directly into React
elements and never injects an HTML string. Unsafe link schemes, remote images and raw HTML
are not interpreted as privileged markup.

## Internationalization

English is the default locale. Traditional Chinese and Japanese catalogues live under
`locales/`, and the extension follows Chrome's interface language. To add another locale,
copy `locales/en/messages.json` to `locales/<locale>/` using a Chrome locale code and
translate the messages. The test suite checks that keys and placeholders remain aligned.

Functional Japanese and Chinese strings also appear in tests, the Book Walker button matcher
and the fixed Notion schema. They are deliberate compatibility fixtures, not untranslated
source comments.

## Privacy and security

- API keys and the Notion token are stored in `chrome.storage.local`, never sync storage.
- Conversations exist only on the side-panel runtime port and are never persisted.
- Content scripts do not call storage or LLM providers directly.
- No marker operation writes to the Book Walker account.

Do not include tokens, API keys, book text or private Notion data in bug reports. See
[`SECURITY.md`](SECURITY.md) for vulnerability reporting.

## Known limitations

- A marker created during the current reader session appears immediately on pages already
  visited in that session. Reload the reader before expecting it on an unvisited page.
- Reading progress is currently stored as `0` because the selection event has no progress
  value.
- Book Walker can change its private API or DOM at any time. DOM-dependent hover and native-UI
  selectors may require updates after a reader redesign.

## Contributing

Bug reports and pull requests are welcome. Read [`CONTRIBUTING.md`](CONTRIBUTING.md) before
submitting changes. CI runs strict type checking, all tests, a production build and extension
packaging. A tag matching `v<package.json version>` creates a GitHub Release with the Chrome
ZIP attached.

## License

Copyright (C) 2026 danny.

This project is licensed under the
[GNU Affero General Public License v3.0 only](LICENSE) (`AGPL-3.0-only`).
