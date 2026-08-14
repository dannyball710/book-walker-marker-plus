import { describe, expect, test } from "vitest"

import {
  BwApiError,
  parseRicResponse,
  tryParseRawMarkerItem
} from "~/core/bwapi/schema"

const RAW_JSON = {
  id: "bec131df-9b6d-4435-9ee7-fdedc4980bd7",
  epubcfi: "epubcfi(/6/24!/4/2/8,/3:11,/3:15)",
  text: "テスト本文",
  memo: "test",
  color: "rgba(255,150,200,0.588235)",
  shape: "rect",
  date: "2026-08-14T12:48:49+0900",
  pr: 3,
  appendix: {
    browser: {
      sidx: 25,
      sFile: "item/xhtml/p-003.xhtml",
      eidx: 28,
      eFile: "item/xhtml/p-003.xhtml",
      position: { normal_default: "item/xhtml/p-003.xhtml#-acs-position-20-0" }
    }
  }
}

describe("tryParseRawMarkerItem", () => {
  test("accepts the wire format observed on the live viewer", () => {
    const marker = tryParseRawMarkerItem(RAW_JSON)
    expect(marker?.id).toBe(RAW_JSON.id)
    expect(marker?.appendix.browser.position.normal_default).toBe(
      "item/xhtml/p-003.xhtml#-acs-position-20-0"
    )
  })

  test("rejects a colour outside the viewer's four presets", () => {
    expect(tryParseRawMarkerItem({ ...RAW_JSON, color: "rgba(0,0,0,1)" })).toBeNull()
  })

  test("rejects a shape other than rect", () => {
    expect(tryParseRawMarkerItem({ ...RAW_JSON, shape: "circle" })).toBeNull()
  })

  test("rejects a region index that is not a number", () => {
    const browser = { ...RAW_JSON.appendix.browser, sidx: "25" }
    expect(tryParseRawMarkerItem({ ...RAW_JSON, appendix: { browser } })).toBeNull()
  })

  test("rejects a region index that is NaN or infinite, not just a non-number", () => {
    // `JSON.parse` cannot produce either, but this entry point takes objects built
    // in-process too. Relaxing the check to `typeof x === "number"` would let both
    // through and hand the viewer a NaN region index, which paints nothing.
    const nan = { ...RAW_JSON.appendix.browser, sidx: Number.NaN }
    const infinite = { ...RAW_JSON.appendix.browser, sidx: Number.POSITIVE_INFINITY }

    expect(tryParseRawMarkerItem({ ...RAW_JSON, appendix: { browser: nan } })).toBeNull()
    expect(
      tryParseRawMarkerItem({ ...RAW_JSON, appendix: { browser: infinite } })
    ).toBeNull()
  })

  test("rejects a date the viewer cannot parse, not merely a non-string", () => {
    expect(tryParseRawMarkerItem({ ...RAW_JSON, date: "2026-08-14T12:48:49Z" })).toBeNull()
    expect(
      tryParseRawMarkerItem({ ...RAW_JSON, date: "2026-08-14 12:48:49+0900" })
    ).toBeNull()
  })

  test("rejects a missing field instead of defaulting it", () => {
    const { memo: _memo, ...withoutMemo } = RAW_JSON
    expect(tryParseRawMarkerItem(withoutMemo)).toBeNull()
  })

  test("drops position keys for font profiles the extension does not model", () => {
    const browser = {
      ...RAW_JSON.appendix.browser,
      position: {
        normal_default: "a#-acs-position-1-0",
        gigantic_serif: "a#-acs-position-9-0"
      }
    }
    const marker = tryParseRawMarkerItem({ ...RAW_JSON, appendix: { browser } })
    expect(Object.keys(marker?.appendix.browser.position ?? {})).toEqual([
      "normal_default"
    ])
  })

  test("rejects a modelled profile whose position is not a string", () => {
    // Unknown keys are tolerated because the viewer may add a profile; a key we do model
    // carrying a number is corrupt data, and dropping it would ship a marker whose /gm
    // placement hint is silently missing for that font size.
    const browser = {
      ...RAW_JSON.appendix.browser,
      position: { normal_default: 123 }
    }
    expect(tryParseRawMarkerItem({ ...RAW_JSON, appendix: { browser } })).toBeNull()
  })

  test("keeps fields outside the wire format out of the result", () => {
    // The output is rebuilt field by field, which is what strips them. A later
    // `{ ...obj }` shortcut would pass unknown fields straight on.
    const marker = tryParseRawMarkerItem({ ...RAW_JSON, injected: "not ours" })
    expect(marker !== null && "injected" in marker).toBe(false)
  })

  test("an absent position key stays absent rather than becoming undefined", () => {
    const browser = { ...RAW_JSON.appendix.browser, position: {} }
    const marker = tryParseRawMarkerItem({ ...RAW_JSON, appendix: { browser } })
    expect("normal_default" in (marker?.appendix.browser.position ?? {})).toBe(false)
  })

  test("skips an entry it cannot model rather than throwing", () => {
    // A /gm batch is a full account snapshot: one App-created marker must not abort it.
    expect(tryParseRawMarkerItem({ id: "app-made", appendix: {} })).toBeNull()
    expect(tryParseRawMarkerItem(42)).toBeNull()
  })
})

describe("response schemas", () => {
  test("parseRicResponse keeps the per-page region ranges", () => {
    const response = parseRicResponse({
      status: "200",
      file: "item/xhtml/p-003.xhtml",
      sidx: 25,
      eidx: 28,
      pages: [{ file: "item/xhtml/p-003.xhtml", sidx: 25, eidx: 28 }]
    })
    expect(response.pages[0]?.sidx).toBe(25)
  })

  test("parseRicResponse rejects a body that reports failure", () => {
    // The WebAPI answers HTTP 200 and signals failure in the body. Accepting one would
    // write a bogus locator and mark the profile backfill complete, so it never retries.
    expect(() =>
      parseRicResponse({
        status: "404",
        file: "item/xhtml/p-003.xhtml",
        sidx: 25,
        eidx: 28,
        pages: []
      })
    ).toThrow(BwApiError)
  })

  test("parseRicResponse accepts an empty page list", () => {
    // /ric can answer without pages, and `mergeProfileLocator` falls back to the top-level
    // file for exactly that case. Rejecting it here would strand the font-change backfill
    // on a response the consumer handles fine.
    const response = parseRicResponse({
      status: "200",
      file: "item/xhtml/p-003.xhtml",
      sidx: 25,
      eidx: 28,
      pages: []
    })
    expect(response.pages).toEqual([])
  })

  test("parseRicResponse rejects a pages list that is not an array", () => {
    expect(() =>
      parseRicResponse({ status: "200", file: "a", sidx: 25, eidx: 28, pages: null })
    ).toThrow(BwApiError)
  })

  test("parseRicResponse rejects a page whose region indexes are unusable", () => {
    // Keeping the good pages and dropping the bad one would shift the last-page fallback
    // onto the wrong page, so the whole response fails instead.
    expect(() =>
      parseRicResponse({
        status: "200",
        file: "a",
        sidx: 25,
        eidx: 28,
        pages: [{ file: "a", sidx: 25, eidx: 28 }, { file: "a", sidx: "26", eidx: 30 }]
      })
    ).toThrow(BwApiError)
  })
})

describe("BwApiError", () => {
  test("is recognisable and keeps the validation error as its cause", () => {
    const error = catchError(() => parseRicResponse({ status: "200" }))

    expect(error).toBeInstanceOf(BwApiError)
    expect(error).toBeInstanceOf(Error)
    if (error instanceof BwApiError) {
      expect(error.cause).toBeDefined()
      expect(error.name).toBe("BwApiError")
    }
  })

  test("reports every invalid field at once, not just the first one found", () => {
    // Returning on the first problem would still throw BwApiError, so only the collected
    // list can catch that regression — and a reader debugging a rejected response needs
    // all of them, not one per run.
    const error = catchError(() => parseRicResponse({ status: "200" }))
    const message = error instanceof BwApiError ? error.message : ""

    for (const field of ["file", "sidx", "eidx", "pages"]) {
      expect(message).toContain(field)
    }
  })
})

function catchError(run: () => void): unknown {
  try {
    run()
    return null
  } catch (error) {
    return error
  }
}
