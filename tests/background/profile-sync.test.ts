import { beforeEach, describe, expect, it, vi } from "vitest"

import { backfillProfile, mergeProfileLocator } from "~/background/profile-sync"
import type { BookContext, BwMarker, RicResponse } from "~/core/marker/types"

let listed: readonly BwMarker[] = []
const stored: BwMarker[] = []

vi.mock("~/background/marker-service", () => ({
  listMarkers: () => Promise.resolve(listed),
  upsertMarker: (m: BwMarker) => {
    stored.push(m)
    return Promise.resolve(m)
  }
}))

const CREATED_AT = 1_700_000_000_000

const marker: BwMarker = {
  id: "m1",
  bookId: "cid-1",
  bookTitle: "サンプル書籍",
  text: "これはテスト用の本文である。",
  memo: "",
  color: "rgba(255,255,35,0.588235)",
  locator: {
    epubcfi: "epubcfi(/6/14[p-003]!/4/2,/1:0,/1:12)",
    capturedProfile: "normal_default",
    byProfile: {
      normal_default: {
        sFile: "item/xhtml/p-003.xhtml",
        sidx: 20,
        eFile: "item/xhtml/p-003.xhtml",
        eidx: 32,
        position: "item/xhtml/p-003.xhtml#-acs-position-20-0"
      }
    }
  },
  progress: 12,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT
}

const ric: RicResponse = {
  status: "200",
  file: "item/xhtml/p-003.xhtml",
  sidx: 44,
  eidx: 61,
  pages: [{ file: "item/xhtml/p-003.xhtml", sidx: 44, eidx: 61 }]
}

describe("mergeProfileLocator", () => {
  it("adds the region indexes /ric returned under the requested profile", () => {
    const merged = mergeProfileLocator(marker, "large_default", ric)
    expect(merged.locator.byProfile.large_default).toEqual({
      sFile: "item/xhtml/p-003.xhtml",
      sidx: 44,
      eFile: "item/xhtml/p-003.xhtml",
      eidx: 61
    })
  })

  it("keeps the profile the marker was captured under, so switching back still renders", () => {
    const merged = mergeProfileLocator(marker, "large_default", ric)
    expect(merged.locator.byProfile.normal_default).toEqual(
      marker.locator.byProfile.normal_default
    )
    expect(merged.locator.capturedProfile).toBe("normal_default")
  })

  it("never rewrites the canonical anchor — it is the only profile-independent key", () => {
    const merged = mergeProfileLocator(marker, "large_default", ric)
    expect(merged.locator.epubcfi).toBe(marker.locator.epubcfi)
  })

  it("takes the end file from the last page when the span crosses files", () => {
    const crossFile: RicResponse = {
      status: "200",
      file: "item/xhtml/p-003.xhtml",
      sidx: 44,
      eidx: 5,
      pages: [
        { file: "item/xhtml/p-003.xhtml", sidx: 44, eidx: 90 },
        { file: "item/xhtml/p-004.xhtml", sidx: 0, eidx: 5 }
      ]
    }
    const merged = mergeProfileLocator(marker, "large_default", crossFile)
    expect(merged.locator.byProfile.large_default?.sFile).toBe("item/xhtml/p-003.xhtml")
    expect(merged.locator.byProfile.large_default?.eFile).toBe("item/xhtml/p-004.xhtml")
  })

  it("falls back to the top-level file when /ric reports no pages", () => {
    const merged = mergeProfileLocator(marker, "large_default", { ...ric, pages: [] })
    expect(merged.locator.byProfile.large_default?.eFile).toBe(ric.file)
  })

  it("leaves the timestamps alone, because upsertMarker stamps updatedAt on write", () => {
    const merged = mergeProfileLocator(marker, "large_default", ric)
    expect(merged.updatedAt).toBe(CREATED_AT)
    expect(merged.createdAt).toBe(CREATED_AT)
  })

  it("leaves the input marker untouched", () => {
    mergeProfileLocator(marker, "large_default", ric)
    expect(marker.locator.byProfile.large_default).toBeUndefined()
  })

  it("overwrites a stale locator when the same profile is recomputed", () => {
    const stale = mergeProfileLocator(marker, "large_default", ric)
    const fresh = mergeProfileLocator(stale, "large_default", { ...ric, sidx: 99, eidx: 120 })
    expect(fresh.locator.byProfile.large_default?.sidx).toBe(99)
    expect(fresh.locator.byProfile.large_default?.eidx).toBe(120)
  })
})

const CONTEXT: BookContext = {
  cid: "cid-1",
  bookTitle: "サンプル書籍",
  u1: "u1-token",
  bid: "177815028231487709004NFBR",
  sfs: "large",
  sff: "default"
}

function markerNeeding(id: string): BwMarker {
  return { ...marker, id }
}

describe("backfillProfile", () => {
  beforeEach(() => {
    listed = []
    stored.length = 0
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
  })

  it("only touches markers that lack an index for the current profile", async () => {
    const already: BwMarker = {
      ...markerNeeding("has-large"),
      locator: {
        ...marker.locator,
        byProfile: {
          ...marker.locator.byProfile,
          large_default: { sFile: "f", sidx: 1, eFile: "f", eidx: 2 }
        }
      }
    }
    listed = [markerNeeding("needs"), already]

    const result = await backfillProfile({ context: CONTEXT, fetchRic: () => Promise.resolve(ric) })

    expect(result).toEqual({ updated: 1, failed: 0 })
    expect(stored.map((m) => m.id)).toEqual(["needs"])
  })

  it("serialises requests, so the viewer's own origin is not flooded", async () => {
    listed = [markerNeeding("a"), markerNeeding("b"), markerNeeding("c")]
    let inFlight = 0
    let peak = 0

    await backfillProfile({
      context: CONTEXT,
      fetchRic: async () => {
        inFlight += 1
        peak = Math.max(peak, inFlight)
        await Promise.resolve()
        inFlight -= 1
        return ric
      }
    })

    expect(peak).toBe(1)
    expect(stored).toHaveLength(3)
  })

  it("counts a failed marker and carries on with the rest of the book", async () => {
    listed = [markerNeeding("a"), markerNeeding("bad"), markerNeeding("c")]

    const result = await backfillProfile({
      context: CONTEXT,
      fetchRic: (m) =>
        m.id === "bad" ? Promise.reject(new Error("timeout")) : Promise.resolve(ric)
    })

    expect(result).toEqual({ updated: 2, failed: 1 })
    expect(stored.map((m) => m.id)).toEqual(["a", "c"])
  })

  it("stops between markers once aborted, leaving the rest for the next sweep", async () => {
    listed = [markerNeeding("a"), markerNeeding("b"), markerNeeding("c")]
    const controller = new AbortController()

    const result = await backfillProfile({
      context: CONTEXT,
      signal: controller.signal,
      fetchRic: () => {
        controller.abort()
        return Promise.resolve(ric)
      }
    })

    expect(result).toEqual({ updated: 1, failed: 0 })
    expect(stored).toHaveLength(1)
  })

  it("writes the marker back with the region indexes /ric returned", async () => {
    listed = [markerNeeding("needs")]

    await backfillProfile({ context: CONTEXT, fetchRic: () => Promise.resolve(ric) })

    expect(stored[0]?.locator.byProfile.large_default).toEqual({
      sFile: ric.file,
      sidx: ric.sidx,
      eFile: ric.file,
      eidx: ric.eidx
    })
  })
})
