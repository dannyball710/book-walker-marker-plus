import { describe, expect, it } from "vitest"

import type { BwMarker } from "~/core/marker/types"
import { markerMatchesQuery } from "~/ui/logic/marker-search"

const MARKER: BwMarker = {
  id: "marker-1",
  bookId: "book-1",
  bookTitle: "青春ブタ野郎",
  text: "雰囲気が変わった",
  memo: "{先輩|せんぱい}の反応",
  color: "rgba(255,255,35,0.588235)",
  locator: {
    epubcfi: "epubcfi(/6/2)",
    capturedProfile: "normal_default",
    byProfile: {}
  },
  progress: 10,
  createdAt: 1,
  updatedAt: 1
}

describe("markerMatchesQuery", () => {
  it("matches the selected passage", () => {
    expect(markerMatchesQuery(MARKER, "雰囲気")).toBe(true)
  })

  it("matches ruby source, visible text, and adjacent readings", () => {
    expect(markerMatchesQuery(MARKER, "せんぱい")).toBe(true)
    expect(markerMatchesQuery(MARKER, "先輩の反応")).toBe(true)
    expect(
      markerMatchesQuery({ ...MARKER, memo: "{出|で}{会|あ}った" }, "であ")
    ).toBe(true)
  })

  it("normalizes width and case", () => {
    const marker = { ...MARKER, memo: "ＡＩ Note" }
    expect(markerMatchesQuery(marker, "ai note")).toBe(true)
  })

  it("returns every marker for a blank query", () => {
    expect(markerMatchesQuery(MARKER, "   ")).toBe(true)
  })

  it("rejects unrelated text", () => {
    expect(markerMatchesQuery(MARKER, "図書館")).toBe(false)
  })
})
