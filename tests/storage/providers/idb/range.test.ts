import { describe, expect, it } from "vitest"

import { buildMarkerRange } from "~/storage/providers/idb/range"

describe("buildMarkerRange", () => {
  it("bounds one profile's index to one chapter so a query never scans the book", () => {
    const spec = buildMarkerRange({
      bookId: "book-1",
      profile: "normal_default",
      file: "item/xhtml/p-003.xhtml",
      sidxFrom: 20,
      sidxTo: 40
    })

    expect(spec).toEqual({
      index: "by-profile-normal_default",
      lower: ["book-1", "item/xhtml/p-003.xhtml", 20],
      upper: ["book-1", "item/xhtml/p-003.xhtml", 40]
    })
  })

  it("keeps the chapter bound when only one side of the sidx range is given", () => {
    const from = buildMarkerRange({
      bookId: "book-1",
      profile: "large_default",
      file: "ch.xhtml",
      sidxFrom: 5
    })
    const to = buildMarkerRange({
      bookId: "book-1",
      profile: "large_default",
      file: "ch.xhtml",
      sidxTo: 5
    })

    expect(from).toEqual({
      index: "by-profile-large_default",
      lower: ["book-1", "ch.xhtml", 5],
      upper: ["book-1", "ch.xhtml", Number.POSITIVE_INFINITY]
    })
    expect(to).toEqual({
      index: "by-profile-large_default",
      lower: ["book-1", "ch.xhtml", Number.NEGATIVE_INFINITY],
      upper: ["book-1", "ch.xhtml", 5]
    })
  })

  it("falls back to by-book when no file is given, because sidx alone is not selective", () => {
    expect(
      buildMarkerRange({
        bookId: "book-1",
        profile: "normal_default",
        sidxFrom: 3,
        sidxTo: 9
      })
    ).toEqual({ index: "by-book", key: "book-1" })
  })

  it("rejects a chapter query with no profile instead of answering the wrong subset", () => {
    // Guessing a profile would silently drop markers measured under another one.
    expect(() =>
      buildMarkerRange({
        bookId: "book-1",
        file: "ch.xhtml",
        sidxFrom: 3,
        sidxTo: 9
      })
    ).toThrow(/requires MarkerQuery.profile/)
  })
})
