import { describe, expect, it } from "vitest"
import { z } from "zod"

import type { BwMarker } from "~/core/marker/types"
import { NotionStoreError } from "~/storage/providers/notion/errors"
import {
  markerToNotionProperties,
  notionPagesToMarkers,
  notionPageToMarker
} from "~/storage/providers/notion/mapping"

const marker: BwMarker = {
  id: "11111111-2222-3333-4444-555555555555",
  bookId: "2450bba4-bee3-4db6-95db-e668c4c76fdd",
  bookTitle: "テスト本",
  text: "選択された本文",
  memo: "{漢字|かんじ} のメモ",
  color: "rgba(255,255,35,0.588235)",
  locator: {
    epubcfi: "epubcfi(/6/8!/4/2/10,/1:0,/1:7)",
    capturedProfile: "normal_default",
    byProfile: {
      normal_default: {
        sFile: "item/xhtml/p-003.xhtml",
        sidx: 20,
        eFile: "item/xhtml/p-003.xhtml",
        eidx: 22,
        position: "item/xhtml/p-003.xhtml#-acs-position-20-0"
      }
    }
  },
  progress: 12.5,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_500_000
}

/** Mirrors how Notion echoes written properties back on a query. */
function asApiPage(source: BwMarker): unknown {
  const properties: { [name: string]: unknown } = {}
  for (const [name, value] of Object.entries(markerToNotionProperties(source))) {
    if ("title" in value) {
      properties[name] = {
        title: value.title.map((item) => ({ plain_text: item.text.content }))
      }
    } else if ("rich_text" in value) {
      properties[name] = {
        rich_text: value.rich_text.map((item) => ({
          plain_text: item.text.content
        }))
      }
    } else {
      properties[name] = value
    }
  }
  return { id: "page-1", properties }
}

const apiPageSchema = z.object({
  id: z.string(),
  properties: z.record(z.string(), z.unknown())
})

function withProperty(page: unknown, name: string, value: unknown): unknown {
  const parsed = apiPageSchema.parse(page)
  return { ...parsed, properties: { ...parsed.properties, [name]: value } }
}

describe("notion property mapping", () => {
  it("round-trips a marker without losing any field", () => {
    expect(notionPageToMarker(asApiPage(marker))).toEqual(marker)
  })

  it("stores a comma-free Notion select name for the marker colour", () => {
    expect(markerToNotionProperties(marker).color).toEqual({
      select: { name: "yellow" }
    })
  })

  it("still reads the legacy raw rgba colour name", () => {
    const legacy = withProperty(asApiPage(marker), "color", {
      select: { name: marker.color }
    })

    expect(notionPageToMarker(legacy).color).toBe(marker.color)
  })

  it("stores surrounding text in the existing technical JSON payload", () => {
    const contextual: BwMarker = {
      ...marker,
      contextText: `直前の十文字${marker.text}直後の十文字`
    }

    expect(notionPageToMarker(asApiPage(contextual))).toEqual(contextual)
  })

  it("keeps every profile's locator, so a font change does not erase the backfill", () => {
    const backfilled: BwMarker = {
      ...marker,
      locator: {
        ...marker.locator,
        byProfile: {
          ...marker.locator.byProfile,
          large_default: {
            sFile: "item/xhtml/p-003.xhtml",
            sidx: 44,
            eFile: "item/xhtml/p-003.xhtml",
            eidx: 61
          }
        }
      }
    }

    const restored = notionPageToMarker(asApiPage(backfilled))

    expect(Object.keys(restored.locator.byProfile).sort()).toEqual([
      "large_default",
      "normal_default"
    ])
    expect(restored).toEqual(backfilled)
  })

  it("joins the briefly used split context payload when reading it back", () => {
    const splitContext = withProperty(asApiPage(marker), "byProfile", {
      rich_text: [
        {
          plain_text: JSON.stringify({
            version: 1,
            byProfile: marker.locator.byProfile,
            contextBefore: "選択前",
            contextAfter: "選択後"
          })
        }
      ]
    })

    expect(notionPageToMarker(splitContext).contextText).toBe(
      `選択前${marker.text}選択後`
    )
  })

  it("reads the legacy raw byProfile JSON written before the context envelope", () => {
    const legacy = withProperty(asApiPage(marker), "byProfile", {
      rich_text: [{ plain_text: JSON.stringify(marker.locator.byProfile) }]
    })

    expect(notionPageToMarker(legacy)).toEqual(marker)
  })

  it("rebuilds the captured profile from the flat columns for a row written before byProfile existed", () => {
    const legacy = withProperty(asApiPage(marker), "byProfile", { rich_text: [] })

    expect(notionPageToMarker(legacy)).toEqual(marker)
  })

  it("splits text past the rich_text limit and rejoins it on read", () => {
    const long = { ...marker, text: "あ".repeat(4500) }
    const title = markerToNotionProperties(long)["原文"]

    expect("title" in title && title.title.length).toBe(3)
    expect(notionPageToMarker(asApiPage(long)).text).toBe(long.text)
  })

  it("stores a marker with no locator for its captured profile as null indexes", () => {
    const orphan: BwMarker = {
      ...marker,
      locator: { ...marker.locator, byProfile: {} }
    }

    expect(markerToNotionProperties(orphan)["sidx"]).toEqual({ number: null })
    expect(notionPageToMarker(asApiPage(orphan))).toEqual(orphan)
  })

  it("rejects a page whose colour is not one of the four viewer colours", () => {
    const patched = withProperty(asApiPage(marker), "color", {
      select: { name: "rgba(0,0,0,1)" }
    })

    expect(() => notionPageToMarker(patched)).toThrow(NotionStoreError)
  })

  it("rejects a page that is missing the markerId correlation key", () => {
    expect(() => notionPageToMarker(asApiPage({ ...marker, id: "" }))).toThrow(
      NotionStoreError
    )
  })

  it("rejects a page whose sidx is a string instead of a number", () => {
    const patched = withProperty(asApiPage(marker), "sidx", { number: "20" })

    expect(() => notionPageToMarker(patched)).toThrow()
  })
})

describe("notionPagesToMarkers", () => {
  it("skips a row the user added by hand instead of hiding the whole book", () => {
    const blankRow = withProperty(asApiPage({ ...marker, id: "" }), "color", {
      select: null
    })

    const mapped = notionPagesToMarkers([
      asApiPage(marker),
      blankRow,
      asApiPage({ ...marker, id: "second" })
    ])

    expect(mapped.markers.map((entry) => entry.id)).toEqual([
      marker.id,
      "second"
    ])
    expect(mapped.skipped).toBe(1)
  })

  it("still fails loud when the database itself lacks a column", () => {
    const apiPage = apiPageSchema.parse(asApiPage(marker))
    const { sidx, ...withoutSidx } = apiPage.properties
    const broken = { ...apiPage, properties: withoutSidx }

    expect(() => notionPagesToMarkers([broken])).toThrow()
  })
})
