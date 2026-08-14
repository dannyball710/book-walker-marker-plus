# BOOK☆WALKER Marker

A Chrome extension that replaces the marker (highlight) feature of the BOOK☆WALKER browser
reader with one the extension owns: highlights and notes stored where you choose, plus an
LLM chat scoped to the passage you selected.

**It never writes back to your BOOK☆WALKER account.** Creating or deleting a marker only
touches local storage (or your own Notion database). Markers already in your account are
left alone — and are not imported either.

## Requirements

- Node.js 18+ (the repo pins pnpm 11.1.1 via `packageManager`)
- pnpm
- Chrome 114+ (the floor for the `chrome.sidePanel` API)

## Development

```bash
pnpm install
pnpm dev          # build/chrome-mv3-dev, rebuilt on change
pnpm build        # build/chrome-mv3-prod
pnpm test         # vitest run
pnpm typecheck    # tsc --noEmit
```

Load it: Chrome → `chrome://extensions` → enable Developer mode → "Load unpacked" → pick
`build/chrome-mv3-dev`.

> **Reload the extension, then reload the reader tab.** Neither content script applies to a
> tab that was already open, and a rebuilt bundle is not picked up by a page refresh alone.
> After `pnpm dev` rebuilds, press reload on `chrome://extensions` and then refresh the tab.

## How it works

Select text in the reader and the passage appears in the side panel, where you give it a
colour and a note. Highlights are drawn on the page and show their note on hover; clicking
one opens it in the panel for editing or for asking the model about it.

The extension holds the whole marker record itself — the passage text, your note, the
colour, and a locator that survives font-size changes. Everything is stored and every model
call is made in the background service worker; the content scripts only render UI and relay
messages.

## Settings

Open them from the gear in the side panel, or right-click the extension icon → Options.

- **Storage provider** — `idb` (local IndexedDB, the default) or `notion`.

  Notion needs an integration token and a database ID, and the database has to be shared
  with that integration. It must have these 17 properties:

  `原文 (title)`, `備註 (rich_text)`, `書籍 (rich_text)`, `bookId (rich_text)`,
  `markerId (rich_text)`, `epubcfi (rich_text)`, `capturedProfile (select)`,
  `file (rich_text)`, `eFile (rich_text)`, `sidx (number)`, `eidx (number)`,
  `position (rich_text)`, `byProfile (rich_text)`, `color (select)`, `progress (number)`,
  `createdAt (date)`, `updatedAt (date)`

  The first three names are Japanese/Chinese on purpose: they are the schema, not UI text,
  so they stay the same in every interface language. A missing property fails validation on
  the first query.

  The two stores are never synced. Switching does not move anything across, and deleting a
  marker only deletes it from the store that is currently selected.

- **LLM provider** — `openrouter`, `openai` or `gemini`. Each takes an API key and a model,
  with an optional reasoning effort (low / medium / high). Leave it unset and no reasoning
  parameter is sent at all, so non-reasoning models are unaffected.

  > **Press "Save settings" and accept Chrome's permission prompt**, or the provider cannot
  > send anything. The three LLM hosts are `optional_host_permissions` — they are requested
  > at the moment you save rather than at install time, so using one provider does not mean
  > granting all of them. A custom base URL needs another save, because it is another host.
  >
  > "Load model list" asks for that provider's host itself, since it is usually pressed
  > before the first save.

- **Prompts** — any number of buttons above the chat. Templates support `{{text}}` (the
  passage), `{{memo}}` (your note) and `{{bookTitle}}`.

## Interface language

English, 繁體中文 and 日本語. The language follows the browser (`chrome.i18n`); there is no
language picker in the extension, and anything unmatched falls back to English.

To add a language, copy `locales/en/messages.json` to `locales/<locale>/` using Chrome's
locale codes (`ko`, `zh_CN`, …) and translate it. No code changes are needed, and
`pnpm test` will catch missing keys or placeholders that drifted.

## Ruby annotations

Notes and model replies both support `{漢字|かんじ}`, rendered as
`<ruby>漢字<rt>かんじ</rt></ruby>`. The same renderer is used by the hover tooltip, the
marker editor and the chat. Editing shows the raw syntax; leaving the field shows the
rendered result. `\{` escapes to a literal `{`.

Model replies additionally render as markdown (headings, lists, tables, code blocks,
links). Rendering goes through marked's lexer straight to React elements and **never
produces an HTML string**, so model output cannot become markup in the panel. Text nodes
still pass through the ruby renderer, so both syntaxes work together. Your own messages are
not parsed as markdown — only ruby is applied.

## Privacy

**Conversations are never stored.** A conversation lives only on the port between the side
panel and the background worker: close the panel, or switch to another marker, and it is
gone. It is not written to IndexedDB and not sent to Notion.

API keys and the Notion token live in `chrome.storage.local`, **not `chrome.storage.sync`**,
so they stay on the machine you typed them on. Nothing but the provider you configured ever
receives them.

## Known limitations

- A marker created during this session is drawn straight away on pages you have already
  visited in this session. On a page you have not opened yet, it appears after you reload
  the reader.
- Reading progress is always `0`: the extension builds the marker from the selection alone,
  and the selection carries no progress value.
- The reader is a moving target. The API paths this extension relies on are matched without
  a version prefix, but the DOM selectors used for hover and for hiding the built-in UI can
  still break on a redesign.
