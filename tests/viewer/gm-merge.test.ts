import { describe, expect, it } from "vitest"

import { mergeGetMarkerResponse } from "~/viewer/gm-merge"
import type { RawMarkerItem } from "~/core/marker/types"

const NATIVE_MARKER = {
  id: "native-1",
  epubcfi: "epubcfi(/6/24!/4/2/8,/3:11,/3:15)",
  text: "テスト本文",
  memo: "native memo",
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
      position: {
        normal_default: "item/xhtml/p-003.xhtml#-acs-position-20-0",
        // a profile our FontProfile union does not model
        gothic_xx: "item/xhtml/p-003.xhtml#-acs-position-31-0"
      }
    },
    // a client we know nothing about
    ios: { page: 42 }
  },
  // a top-level field BOOK☆WALKER may add later
  deviceName: "iPhone"
}

const OUR_MARKER: RawMarkerItem = {
  id: "ours-1",
  epubcfi: "epubcfi(/6/24!/4/2/8,/3:20,/3:24)",
  text: "先輩",
  memo: "{漢字|かんじ}",
  color: "rgba(140,255,35,0.588235)",
  shape: "rect",
  date: "2026-08-14T13:00:00+0900",
  pr: 5,
  appendix: {
    browser: {
      sidx: 40,
      sFile: "item/xhtml/p-003.xhtml",
      eidx: 43,
      eFile: "item/xhtml/p-003.xhtml",
      position: {}
    }
  }
}

function responseText(markers: readonly unknown[], extra: object = {}): string {
  return JSON.stringify({
    status: "200",
    timestamp: "2026-08-14T13:50:08+0900",
    markers,
    ...extra
  })
}

function markersOf(text: string): readonly unknown[] {
  const parsed: unknown = JSON.parse(text)
  if (typeof parsed !== "object" || parsed === null) throw new Error("not an object")
  const markers: unknown = Reflect.get(parsed, "markers")
  if (!Array.isArray(markers)) throw new Error("no markers")
  return markers
}

describe("mergeGetMarkerResponse", () => {
  it("appends our markers after the viewer's own", () => {
    const merged = mergeGetMarkerResponse(responseText([NATIVE_MARKER]), [OUR_MARKER])
    expect(merged.ok).toBe(true)
    if (!merged.ok) return
    const markers = markersOf(merged.text)
    expect(markers).toHaveLength(2)
    expect(markers[0]).toEqual(NATIVE_MARKER)
    expect(markers[1]).toEqual(OUR_MARKER)
  })

  it("leaves fields we do not model on a native marker untouched", () => {
    const merged = mergeGetMarkerResponse(responseText([NATIVE_MARKER]), [OUR_MARKER])
    expect(merged.ok).toBe(true)
    if (!merged.ok) return
    const native = markersOf(merged.text)[0]
    // These would all be stripped by a round-trip through our zod schema.
    expect(native).toEqual(NATIVE_MARKER)
    expect(Reflect.get(Object(native), "deviceName")).toBe("iPhone")
  })

  it("keeps unmodelled top-level response fields", () => {
    const merged = mergeGetMarkerResponse(
      responseText([NATIVE_MARKER], { syncVersion: 7 }),
      [OUR_MARKER]
    )
    expect(merged.ok).toBe(true)
    if (!merged.ok) return
    const parsed: unknown = JSON.parse(merged.text)
    expect(Reflect.get(Object(parsed), "syncVersion")).toBe(7)
  })

  it("returns the response byte-for-byte when there is nothing to inject", () => {
    const text = responseText([NATIVE_MARKER])
    const merged = mergeGetMarkerResponse(text, [])
    expect(merged.ok).toBe(true)
    if (!merged.ok) return
    expect(merged.text).toBe(text)
  })

  it("does not inject a marker the viewer already has", () => {
    const ours: RawMarkerItem = { ...OUR_MARKER, id: NATIVE_MARKER.id }
    const text = responseText([NATIVE_MARKER])
    const merged = mergeGetMarkerResponse(text, [ours])
    expect(merged.ok).toBe(true)
    if (!merged.ok) return
    expect(merged.text).toBe(text)
  })

  it("refuses to touch a response that is not shaped like /gm", () => {
    expect(mergeGetMarkerResponse("<html>error</html>", [OUR_MARKER]).ok).toBe(false)
    expect(mergeGetMarkerResponse(JSON.stringify({ status: "500" }), [OUR_MARKER]).ok).toBe(
      false
    )
  })

  it("still injects when a native marker does not match our schema at all", () => {
    // A marker made in the BOOK☆WALKER app: no appendix.browser, so validating it
    // would abandon the injection and leave the book with no extension highlights.
    const foreign = { id: "app-1", epubcfi: "epubcfi(/6/24!/4/2/8)", appendix: {} }
    const merged = mergeGetMarkerResponse(responseText([foreign]), [OUR_MARKER])
    expect(merged.ok).toBe(true)
    if (!merged.ok) return
    const markers = markersOf(merged.text)
    expect(markers).toEqual([foreign, OUR_MARKER])
  })

  it("keeps an entry it cannot read instead of failing the injection", () => {
    const merged = mergeGetMarkerResponse(
      responseText([NATIVE_MARKER, "junk", { noId: true }]),
      [OUR_MARKER]
    )
    expect(merged.ok).toBe(true)
    if (!merged.ok) return
    expect(markersOf(merged.text)).toHaveLength(4)
  })
})
