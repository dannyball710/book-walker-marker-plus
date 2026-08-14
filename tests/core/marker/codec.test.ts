import { describe, expect, test } from "vitest"

import { epochMsToJstDate, isJstDate, toRawMarkerItem } from "~/core/marker/codec"
import type { BwMarker } from "~/core/marker/types"

const CREATED_AT = Date.UTC(2026, 7, 14, 3, 48, 49)

/** Shaped after a marker observed on the live viewer. */
const MARKER: BwMarker = {
  id: "bec131df-9b6d-4435-9ee7-fdedc4980bd7",
  bookId: "2450bba4-bee3-4db6-95db-e668c4c76fdd",
  bookTitle: "サンプル書籍：テスト用のながいタイトル",
  text: "テスト本文",
  memo: "test",
  color: "rgba(255,150,200,0.588235)",
  locator: {
    epubcfi: "epubcfi(/6/24!/4/2/8,/3:11,/3:15)",
    capturedProfile: "normal_default",
    byProfile: {
      normal_default: {
        sFile: "item/xhtml/p-003.xhtml",
        sidx: 25,
        eFile: "item/xhtml/p-003.xhtml",
        eidx: 28,
        position: "item/xhtml/p-003.xhtml#-acs-position-20-0"
      }
    }
  },
  progress: 3,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT
}

describe("JST date codec", () => {
  test("+0900 is added, not ignored", () => {
    expect(epochMsToJstDate(CREATED_AT)).toBe("2026-08-14T12:48:49+0900")
  })

  test("a date before the UTC day boundary still renders in JST", () => {
    // 2026-01-01T00:30+0900 is 2025-12-31T15:30 UTC.
    expect(epochMsToJstDate(Date.UTC(2025, 11, 31, 15, 30, 0))).toBe(
      "2026-01-01T00:30:00+0900"
    )
  })

  test("isJstDate accepts what the viewer writes and rejects what it cannot parse", () => {
    expect(isJstDate("2026-08-14T12:48:49+0900")).toBe(true)
    expect(isJstDate("2026-08-14T12:48:49+09:00")).toBe(true)
    expect(isJstDate("2026-08-14T12:48:49Z")).toBe(false)
    expect(isJstDate("2026/08/14 12:48")).toBe(false)
  })
})

describe("BwMarker → RawMarkerItem", () => {
  test("hands the viewer the region indexes of the profile it is painting", () => {
    const raw = toRawMarkerItem(MARKER, "normal_default")

    expect(raw).toEqual({
      id: MARKER.id,
      epubcfi: MARKER.locator.epubcfi,
      text: MARKER.text,
      memo: MARKER.memo,
      color: MARKER.color,
      shape: "rect",
      date: "2026-08-14T12:48:49+0900",
      pr: MARKER.progress,
      appendix: {
        browser: {
          sidx: 25,
          sFile: "item/xhtml/p-003.xhtml",
          eidx: 28,
          eFile: "item/xhtml/p-003.xhtml",
          position: { normal_default: "item/xhtml/p-003.xhtml#-acs-position-20-0" }
        }
      }
    })
  })

  test("a marker the extension made itself has no position hint to pass on", () => {
    const selfMade: BwMarker = {
      ...MARKER,
      locator: {
        ...MARKER.locator,
        byProfile: {
          normal_default: {
            sFile: "item/xhtml/p-003.xhtml",
            sidx: 25,
            eFile: "item/xhtml/p-003.xhtml",
            eidx: 28
          }
        }
      }
    }

    expect(toRawMarkerItem(selfMade, "normal_default")?.appendix.browser.position).toEqual(
      {}
    )
  })

  test("positions of the other profiles are emitted too, so a font change keeps them", () => {
    const twoProfiles: BwMarker = {
      ...MARKER,
      locator: {
        ...MARKER.locator,
        byProfile: {
          ...MARKER.locator.byProfile,
          large_default: {
            sFile: "item/xhtml/p-003.xhtml",
            sidx: 31,
            eFile: "item/xhtml/p-003.xhtml",
            eidx: 34,
            position: "item/xhtml/p-003.xhtml#-acs-position-24-0"
          }
        }
      }
    }
    const raw = toRawMarkerItem(twoProfiles, "normal_default")

    expect(raw?.appendix.browser.sidx).toBe(25)
    expect(raw?.appendix.browser.position).toEqual({
      normal_default: "item/xhtml/p-003.xhtml#-acs-position-20-0",
      large_default: "item/xhtml/p-003.xhtml#-acs-position-24-0"
    })
  })

  test("a marker with no region index for the profile cannot be rendered", () => {
    expect(toRawMarkerItem(MARKER, "large_default")).toBeNull()
  })
})
