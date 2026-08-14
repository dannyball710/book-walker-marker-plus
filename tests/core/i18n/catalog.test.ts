import { readFileSync } from "node:fs"
import { afterEach, describe, expect, it } from "vitest"
import * as z from "zod"

import { joinList, t } from "~/core/i18n"

const entrySchema = z.object({
  message: z.string(),
  placeholders: z
    .record(z.string(), z.object({ content: z.string() }))
    .optional()
})

const catalogueSchema = z.record(z.string(), entrySchema)

type Catalogue = z.infer<typeof catalogueSchema>

function load(locale: string): Catalogue {
  const path = new URL(`../../../locales/${locale}/messages.json`, import.meta.url)
  return catalogueSchema.parse(JSON.parse(readFileSync(path, "utf-8")))
}

/** en is default_locale and the type source, so it defines what the others must carry. */
const base = load("en")
const translations = [
  { locale: "zh_TW", catalogue: load("zh_TW") },
  { locale: "ja", catalogue: load("ja") }
]

function placeholderSlots(entry: Catalogue[string]): readonly string[] {
  return Object.entries(entry.placeholders ?? {})
    .map(([name, placeholder]) => `${name}=${placeholder.content}`)
    .sort()
}

const REFERENCE = /\$([A-Za-z0-9_]+)\$/g

describe("locale catalogues", () => {
  it.each(translations)("$locale carries exactly the keys en has", ({ catalogue }) => {
    // A missing key silently falls back to en at runtime, so only this catches it.
    expect(Object.keys(catalogue).sort()).toEqual(Object.keys(base).sort())
  })

  it.each(translations)(
    "$locale declares the same placeholders in the same slots",
    ({ catalogue }) => {
      // Slots are positional in chrome.i18n: a locale that renumbers them swaps the
      // values around in that language only.
      for (const [key, entry] of Object.entries(base)) {
        expect(placeholderSlots(catalogue[key] ?? { message: "" })).toEqual(
          placeholderSlots(entry)
        )
      }
    }
  )

  it.each([{ locale: "en", catalogue: base }, ...translations])(
    "$locale only references placeholders it declares",
    ({ catalogue }) => {
      // An undeclared $name$ reaches the user verbatim instead of being substituted.
      const undeclared: string[] = []
      for (const [key, entry] of Object.entries(catalogue)) {
        const declared = Object.keys(entry.placeholders ?? {})
        for (const match of entry.message.matchAll(REFERENCE)) {
          if (!declared.includes(match[1] ?? "")) {
            undeclared.push(`${key}: $${match[1]}$`)
          }
        }
      }
      expect(undeclared).toEqual([])
    }
  )
})

describe("t", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "chrome")
  })

  it("falls back to the en catalogue where chrome.i18n does not exist", () => {
    expect(t("commonSave")).toBe(base.commonSave?.message)
    expect(t("optionsLoadFailed", { reason: "boom" })).toContain("boom")
  })

  it("passes named arguments to chrome.i18n in the slots the catalogue assigns", () => {
    const seen: { key?: string; substitutions?: readonly string[] } = {}
    Reflect.set(globalThis, "chrome", {
      i18n: {
        getMessage(key: string, substitutions: readonly string[]) {
          seen.key = key
          seen.substitutions = substitutions
          return "from chrome"
        }
      }
    })

    expect(t("errorNotionHttp", { detail: "d", status: "429" })).toBe("from chrome")
    expect(seen.key).toBe("errorNotionHttp")
    // Declared order in the catalogue, not the order the caller wrote them in.
    expect(seen.substitutions).toEqual(["429", "d"])
  })
})

describe("joinList", () => {
  it("joins with the locale's own separator", () => {
    expect(joinList(["a", "b"])).toBe(`a${base.commonListSeparator?.message ?? ""}b`)
  })
})
