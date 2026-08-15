import { afterEach, describe, expect, it, vi } from "vitest"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe("Notion property names", () => {
  it("uses the English catalogue when chrome.i18n is unavailable", async () => {
    const { PROP } = await import("~/storage/providers/notion/property-names")

    expect({ text: PROP.text, memo: PROP.memo, book: PROP.bookTitle }).toEqual({
      text: "Text",
      memo: "Note",
      book: "Book"
    })
  })

  it("uses the active chrome.i18n catalogue", async () => {
    const messages: Readonly<Record<string, string>> = {
      notionPropertyTextName: "本文",
      notionPropertyMemoName: "メモ",
      notionPropertyBookName: "書籍"
    }
    vi.stubGlobal("chrome", {
      i18n: {
        getMessage(key: string) {
          return messages[key] ?? ""
        }
      }
    })

    const { PROP } = await import("~/storage/providers/notion/property-names")

    expect({ text: PROP.text, memo: PROP.memo, book: PROP.bookTitle }).toEqual({
      text: "本文",
      memo: "メモ",
      book: "書籍"
    })
  })
})
