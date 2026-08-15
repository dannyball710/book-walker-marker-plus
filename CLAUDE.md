# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Chrome MV3 extension (Plasmo) that replaces the marker feature of the Book Walker browser
reader with its own: highlights and notes in a storage backend of the user's choosing, plus
an LLM chat scoped to the selected passage. `README.md` covers what it does from the user's
side; this file covers the parts that take several files to work out.

## Commands

```bash
pnpm dev          # plasmo dev → build/chrome-mv3-dev, rebuilt on change
pnpm build        # plasmo build → build/chrome-mv3-prod
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest run

pnpm test tests/viewer/marker-color.test.ts    # one file
pnpm test -t "joins with the locale"           # by test name
```

Do not add `engines.node` to `package.json`. Plasmo's Parcel 2.9 inherits it when creating
the WebExtension target, misclassifies the build as Node, and leaves browser dependencies
such as `zod` as runtime externals. Keep the Node requirement in `.nvmrc`, documentation and
CI instead. `pnpm verify:package` executes the built service worker in a browser-like VM to
catch this failure mode.

**Reloading the reader tab is not enough to see a code change.** Reload the extension on
`chrome://extensions` first, then refresh the tab. Neither content script applies to a tab
that was open before the extension loaded, and the MAIN-world script is registered at
runtime by Plasmo through `chrome.scripting.registerContentScripts` (which is why the built
manifest gains a `scripting` permission that `package.json` never asks for). This is the
single most common way to waste time here — it looks exactly like "my change did nothing".

## Non-negotiable constraints

- **Storage and LLM calls only ever happen in the background worker.** Content scripts do UI
  and message relaying, nothing else.
- **Strict types.** No `any`, no loose dictionaries like `Record<string, any>`. `tsconfig`
  already enables `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` and
  `noUnusedLocals`.
- **Never write back to the Book Walker account.** The upload endpoint is short-circuited,
  and deleting a marker only touches our own store. This is settled — do not add a
  "sync back" option.
- API keys and the Notion token go in `chrome.storage.local`, **never `chrome.storage.sync`**.
- Markers carry bookId / sidx / eidx so a query can load part of the data instead of all of
  it.

## Architecture

### Two worlds, two content scripts

`src/contents/` holds **exactly two entry files** — Plasmo registers every file in that
directory as a content script, so helpers there get registered by mistake. Helpers live in
`src/viewer/`.

- `viewer-bridge.ts` (MAIN world) patches `XMLHttpRequest`. It has to share the page's JS
  realm; a patch applied from the ISOLATED world has no effect on the page. It has no
  `chrome.runtime`, so it talks over `window.postMessage`.
- `viewer-ui.tsx` (ISOLATED world) owns the hover tooltip, the click interception, the
  highlight reconcile loop, and relaying to the background.

The bridge reads the passage text out of the reader's own API response, blocks the upload
endpoint, and appends our markers to the read response so the reader renders them with its
own engine — which is what makes page turns and font-size reflow work for free.

### Highlights are reconciled continuously, not drawn once

`#pageHighlight` belongs to the reader. Turning a page removes every `highlight_group_*`,
and turning back rebuilds them under the same ids from the reader's in-memory list, which it
fetched once at load. **A one-shot draw or a one-shot removal is always undone.**

So `viewer-ui.tsx` runs `reconcileHighlights()` on every mutation instead. One pass caches
the geometry of rects the reader drew (keyed by region index, storing the group's *id*
because the element itself gets rebuilt), removes rects for markers deleted this session,
adds rects for markers the reader does not know about, and rebuilds the hit-test list. It
writes only real differences, so its own mutations converge instead of feeding its observer
forever.

Do not try to compute highlight geometry. Clone what the reader already drew — the data
needed to derive it is not available to us.

Colour is not the stored rgba: the inner `<svg>` carries `opacity: 0.5`, so use
`opaqueFillFor()` in `src/viewer/marker-color.ts` or our highlights come out a shade lighter
than the reader's own.

### Provider skeleton (shared by storage and llm)

`core/provider/descriptor.ts` defines `ProviderDescriptor`: `fields` (the options page
renders the form from these), `validate`, `hostsFor`. Stored config is always `ConfigValues`
— all strings — which each provider parses into its own typed config with a zod codec.
Adding a provider means adding a module and registering it: **no options-page change, no new
settings field, no switch statement.**

LLM hosts are `optional_host_permissions`, requested when the user saves settings or presses
"Load model list". `chrome.permissions.request()` only prompts while the click is still on
the call stack, so **nothing may be awaited before it** on those paths. `chrome.sidePanel.open()`
has the same requirement.

### Three message layers

- MAIN ↔ ISOLATED: `window.postMessage`, with hand-written type guards in
  `src/viewer/bridge-protocol.ts` (no zod — the MAIN-world bundle stays small). Every
  message carries `source: "bwm"` and is checked against `event.source === window`.
- UI/ISOLATED ↔ background: `@plasmohq/messaging`. **`src/messaging.d.ts` is the single
  source of message names** — Plasmo only emits its type augmentation while `dev`/`build`
  runs, so a plain `tsc --noEmit` would see `never`. `tsconfig.json` lists
  `.plasmo/index.d.ts` in `include` and then cancels it in `exclude`; that is only there to
  stop Plasmo rewriting the file, and neither half can be dropped.
- Chat streaming: a `chrome.runtime.connect` port. Conversations are never persisted.

Background handlers are wrapped in `handle()` and resolve a `BgResult` envelope rather than
rejecting; `unwrap()` in `src/ui/messages.ts` turns a failure back into a throw on the UI
side.

### i18n

`locales/{en,zh_TW,ja}/messages.json` behind the typed `t()` in `src/core/i18n`, which wraps
`chrome.i18n`. `en` is `default_locale` and the type source, so an unknown key or a wrong
placeholder name fails to compile. Named arguments are mapped onto chrome's positional
substitutions by reading each message's `placeholders` block.

Add new strings to `en` first. `tests/core/i18n/catalog.test.ts` fails if the three
catalogues drift apart. Where `chrome.i18n` is absent (unit tests, MAIN world) `t()` falls
back to the bundled `en` text, so it is safe to call anywhere and needs no stub.

The three reader-facing Notion property names are localised. `PROP_ALIASES` keeps rows from
all shipped locales readable, and schema repair renames a compatible alias without changing
its values; technical property names remain stable. Deliberately not localised: the reader's
own button labels that we match against, and the LLM system prompt wording (its configured
response language is localised separately).

### Font profiles

`sidx` / `eidx` are region indexes and **only mean something inside the font profile they
were measured in**. `BwMarker.locator.byProfile` keeps one locator per profile, and
`background/profile-sync.ts` backfills a missing one. Comparing indexes across profiles is
always wrong — `assertProfiledQuery()` exists so such a query fails loudly instead of
returning a plausible but wrong subset.

## Tests

`tests/` mirrors `src/`. The environment is node: there is no `chrome`, and `t()` falls back
to the bundled English catalogue, so no stubbing is needed. Everything under `core/` is pure
and fully testable; code that touches `chrome` APIs is kept in a thin outer layer on purpose
(`chat-port.ts` never touches `chrome`, which is what makes its concurrency state machine
testable).

Do not assert on literal user-facing wording — compare against `t("key")`. Wording changes
with translation and rewrites; the test should pin the intent.

Japanese fixtures (`先輩`, `なぜ？`, `{漢字|かんじ}`) are deliberate: this extension reads
Japanese books.

## Conventions

- Comments in English, explaining *why*. This repository is public — keep it that way.
- Multi-line commit messages go through `git commit -F <file>`. Do **not** use a PowerShell
  here-string (`-m @'...'@`) — in this environment the `@` delimiters leak into the subject.
