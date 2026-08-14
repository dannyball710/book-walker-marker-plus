import { describe, expect, it } from "vitest"

import {
  buildNotionQueryFilter,
  markerIdFilter
} from "~/storage/providers/notion/filter"

describe("buildNotionQueryFilter", () => {
  it("narrows to one chapter slice, matching the only profile Notion can answer", () => {
    expect(
      buildNotionQueryFilter({
        bookId: "book-1",
        profile: "normal_default",
        file: "ch.xhtml",
        sidxFrom: 10,
        sidxTo: 30
      })
    ).toEqual({
      and: [
        { property: "bookId", rich_text: { equals: "book-1" } },
        { property: "capturedProfile", select: { equals: "normal_default" } },
        { property: "file", rich_text: { equals: "ch.xhtml" } },
        { property: "sidx", number: { greater_than_or_equal_to: 10 } },
        { property: "sidx", number: { less_than_or_equal_to: 30 } }
      ]
    })
  })

  it("rejects a chapter query with no profile instead of answering the wrong subset", () => {
    expect(() =>
      buildNotionQueryFilter({ bookId: "book-1", file: "ch.xhtml" })
    ).toThrow(/requires MarkerQuery.profile/)
  })

  it("omits optional conditions rather than sending unbounded placeholders", () => {
    expect(buildNotionQueryFilter({ bookId: "book-1" })).toEqual({
      and: [{ property: "bookId", rich_text: { equals: "book-1" } }]
    })
  })
})

describe("markerIdFilter", () => {
  it("matches on the correlation key, not on the Notion page id", () => {
    expect(markerIdFilter("marker-9")).toEqual({
      and: [{ property: "markerId", rich_text: { equals: "marker-9" } }]
    })
  })
})
