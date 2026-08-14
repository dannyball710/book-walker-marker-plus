import { describe, expect, it } from "vitest"

import {
  findMarkerAtRegion,
  hitTestRegion,
  regionIndexFromRectId,
  unpaintedRegions
} from "~/viewer/highlight-index"
import type { BwMarker, FontProfile, ProfileLocator } from "~/core/marker/types"

const PROFILE: FontProfile = "normal_default"

function marker(
  id: string,
  locators: { readonly [P in FontProfile]?: ProfileLocator },
  updatedAt = 1
): BwMarker {
  return {
    id,
    bookId: "book",
    bookTitle: "title",
    text: "テスト本文",
    memo: "memo",
    color: "rgba(255,150,200,0.588235)",
    locator: {
      epubcfi: "epubcfi(/6/24!/4/2/8,/3:11,/3:15)",
      capturedProfile: PROFILE,
      byProfile: locators
    },
    progress: 3,
    createdAt: 1,
    updatedAt
  }
}

function locator(sidx: number, eidx: number): ProfileLocator {
  return {
    sFile: "item/xhtml/p-003.xhtml",
    sidx,
    eFile: "item/xhtml/p-003.xhtml",
    eidx
  }
}

describe("unpaintedRegions", () => {
  it("claims the whole range of a marker the viewer never drew", () => {
    // The case this exists for: the viewer read its marker list once, at load, so a
    // marker saved since is absent from the page entirely.
    const fresh = marker("m1", { [PROFILE]: locator(25, 28) })
    expect(unpaintedRegions(fresh, PROFILE, new Set())).toEqual([25, 26, 27, 28])
  })

  it("claims nothing for a marker already on the page", () => {
    const drawn = marker("m1", { [PROFILE]: locator(25, 27) })
    expect(unpaintedRegions(drawn, PROFILE, new Set([25, 26, 27]))).toEqual([])
  })

  it("claims only the gaps, so a partly drawn marker is not drawn twice", () => {
    const partial = marker("m1", { [PROFILE]: locator(25, 28) })
    expect(unpaintedRegions(partial, PROFILE, new Set([25, 27]))).toEqual([26, 28])
  })

  it("claims nothing in a profile it has no region indexes for", () => {
    // Region indexes are profile-dependent, so drawing another profile's range would
    // put the highlight over unrelated text.
    const other = marker("m1", { large_default: locator(25, 28) })
    expect(unpaintedRegions(other, PROFILE, new Set())).toEqual([])
  })
})

describe("regionIndexFromRectId", () => {
  it("reads the region index a highlight rect encodes", () => {
    expect(regionIndexFromRectId("highlight_25")).toBe(25)
    expect(regionIndexFromRectId("highlight_0")).toBe(0)
  })

  it("rejects the per-page group svg, which shares the prefix", () => {
    expect(regionIndexFromRectId("highlight_group_11")).toBeNull()
  })

  it("rejects ids that are not a bare non-negative integer", () => {
    expect(regionIndexFromRectId("highlight_")).toBeNull()
    expect(regionIndexFromRectId("highlight_-1")).toBeNull()
    expect(regionIndexFromRectId("highlight_1.5")).toBeNull()
    expect(regionIndexFromRectId("pageHighlight_1")).toBeNull()
  })
})

describe("hitTestRegion", () => {
  const rects = [
    { regionIndex: 25, box: { left: 10, top: 10, right: 39, bottom: 39 } },
    { regionIndex: 26, box: { left: 10, top: 40, right: 39, bottom: 69 } }
  ]

  it("returns the region whose box contains the point", () => {
    expect(hitTestRegion(rects, 20, 20)).toBe(25)
    expect(hitTestRegion(rects, 20, 50)).toBe(26)
  })

  it("returns null outside every box", () => {
    expect(hitTestRegion(rects, 100, 100)).toBeNull()
    expect(hitTestRegion([], 20, 20)).toBeNull()
  })
})

describe("findMarkerAtRegion", () => {
  it("matches a region inside the marker's inclusive sidx..eidx range", () => {
    const m = marker("a", { normal_default: locator(25, 28) })
    expect(findMarkerAtRegion([m], 25, PROFILE)?.id).toBe("a")
    expect(findMarkerAtRegion([m], 28, PROFILE)?.id).toBe("a")
    expect(findMarkerAtRegion([m], 24, PROFILE)).toBeNull()
    expect(findMarkerAtRegion([m], 29, PROFILE)).toBeNull()
  })

  it("ignores markers with no locator for the active profile, because region indexes are profile-dependent", () => {
    const m = marker("a", { "x-large_default": locator(25, 28) })
    expect(findMarkerAtRegion([m], 26, PROFILE)).toBeNull()
  })

  it("prefers the narrowest marker when ranges overlap", () => {
    const wide = marker("wide", { normal_default: locator(20, 40) })
    const narrow = marker("narrow", { normal_default: locator(25, 28) })
    expect(findMarkerAtRegion([wide, narrow], 26, PROFILE)?.id).toBe("narrow")
    expect(findMarkerAtRegion([narrow, wide], 26, PROFILE)?.id).toBe("narrow")
    expect(findMarkerAtRegion([wide, narrow], 21, PROFILE)?.id).toBe("wide")
  })

  it("prefers the most recently updated marker when spans tie", () => {
    const older = marker("older", { normal_default: locator(25, 28) }, 100)
    const newer = marker("newer", { normal_default: locator(25, 28) }, 200)
    expect(findMarkerAtRegion([older, newer], 26, PROFILE)?.id).toBe("newer")
    expect(findMarkerAtRegion([newer, older], 26, PROFILE)?.id).toBe("newer")
  })
})
