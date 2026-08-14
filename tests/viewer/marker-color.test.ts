import { describe, expect, it } from "vitest"

import { opaqueFillFor, parseRgba } from "~/viewer/marker-color"

/** The viewer's highlight layer, measured on the live viewer. */
const LAYER = 0.5

describe("opaqueFillFor", () => {
  it("reproduces the fills the viewer paints for its own palette", () => {
    // Both pairs were read off the running viewer: the left side is what the marker is
    // stored as, the right side is what the viewer actually puts on the page. A change
    // that breaks this makes our highlights a visibly different shade from the viewer's.
    expect(opaqueFillFor("rgba(255,150,200,0.588235)", LAYER)).toBe("rgb(255,131,190)")
    expect(opaqueFillFor("rgba(255,255,35,0.588235)", LAYER)).toBe("rgb(255,255,0)")
  })

  it("covers the rest of the viewer's palette without going out of range", () => {
    for (const color of ["rgba(140,255,35,0.588235)", "rgba(150,200,255,0.588235)"]) {
      const channels = /^rgb\((\d+),(\d+),(\d+)\)$/.exec(opaqueFillFor(color, LAYER))
      expect(channels).not.toBeNull()
      for (const channel of channels?.slice(1) ?? []) {
        expect(Number(channel)).toBeGreaterThanOrEqual(0)
        expect(Number(channel)).toBeLessThanOrEqual(255)
      }
    }
  })

  it("blends over white when the layer has no opacity of its own to undo", () => {
    // 255 * 0.5 + 255 * 0.5 stays 255; 0 * 0.5 + 255 * 0.5 is 128.
    expect(opaqueFillFor("rgba(255,0,0,0.5)", 1)).toBe("rgb(255,128,128)")
  })

  it("returns the colour untouched when it cannot be read or there is no layer", () => {
    // Better a slightly wrong shade than a marker that is not drawn at all.
    expect(opaqueFillFor("yellow", LAYER)).toBe("yellow")
    expect(opaqueFillFor("rgba(255,255,35,0.588235)", 0)).toBe("rgba(255,255,35,0.588235)")
  })
})

describe("parseRgba", () => {
  it("reads the alpha, and treats rgb() as fully opaque", () => {
    expect(parseRgba("rgba(255,150,200,0.588235)")).toEqual({
      r: 255,
      g: 150,
      b: 200,
      a: 0.588235
    })
    expect(parseRgba("rgb(255, 131, 190)")).toEqual({ r: 255, g: 131, b: 190, a: 1 })
  })

  it("rejects anything that is not an rgb(a) triple", () => {
    expect(parseRgba("#ffcc00")).toBeNull()
    expect(parseRgba("rgba(255,150,200")).toBeNull()
  })
})
