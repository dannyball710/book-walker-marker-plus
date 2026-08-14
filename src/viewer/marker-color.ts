/**
 * The viewer stores a marker colour as the translucent colour it should look like on the
 * page, but paints an opaque fill, because the layer it paints into carries its own
 * opacity. Drawing the stored colour straight into that layer fades it twice, which is
 * visibly paler than the viewer's own highlights.
 *
 * Measured on the live viewer: the `<svg>` inside `#pageHighlight` has
 * `opacity: 0.5`, and the four palette colours all carry alpha 0.588235.
 */
const RGBA = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/

interface Rgba {
  readonly r: number
  readonly g: number
  readonly b: number
  readonly a: number
}

export function parseRgba(color: string): Rgba | null {
  const match = RGBA.exec(color.trim())
  if (match === null) return null
  const [r, g, b] = [match[1], match[2], match[3]].map((part) => Number(part))
  const alpha = match[4] === undefined ? 1 : Number(match[4])
  if (r === undefined || g === undefined || b === undefined) return null
  if (!Number.isFinite(alpha)) return null
  return { r, g, b, a: alpha }
}

const clampChannel = (value: number): number => Math.min(255, Math.max(0, Math.round(value)))

/**
 * The opaque fill to paint so a marker lands on the page the same shade the viewer paints
 * it. Blending `a` of the colour over white must equal blending `layerOpacity` of the
 * result over white, which leaves `c * a/layerOpacity + 255 * (1 - a/layerOpacity)`.
 *
 * Verified against the viewer's own output: pink `rgba(255,150,200,0.588235)` becomes
 * `rgb(255,131,190)` and yellow `rgba(255,255,35,0.588235)` becomes `rgb(255,255,0)`.
 *
 * A colour we cannot read, or a layer with no opacity to compensate for, is returned
 * unchanged — a slightly wrong shade beats not drawing the marker at all.
 */
export function opaqueFillFor(color: string, layerOpacity: number): string {
  const rgba = parseRgba(color)
  if (rgba === null || layerOpacity <= 0) return color
  const scale = rgba.a / layerOpacity
  const channel = (value: number): number => clampChannel(value * scale + 255 * (1 - scale))
  return `rgb(${channel(rgba.r)},${channel(rgba.g)},${channel(rgba.b)})`
}
