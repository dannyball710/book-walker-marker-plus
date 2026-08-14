/**
 * Conversion from the extension's own `BwMarker` into the BOOK☆WALKER wire format
 * (`RawMarkerItem`), which is what /gm injection hands the viewer to paint.
 */
import {
  FONT_PROFILES,
  type BwMarker,
  type FontProfile,
  type MarkerLocator,
  type RawMarkerItem
} from "./types"

const JST_OFFSET_MS = 9 * 60 * 60 * 1000
const JST_DATE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})([+-])(\d{2}):?(\d{2})$/

/** The viewer parses `date` itself, so a validator rejects a shape it would choke on. */
export function isJstDate(date: string): boolean {
  return JST_DATE.test(date)
}

/** `'2026-08-14T12:48:49+0900'`; the viewer only ever writes `+0900`. */
export function epochMsToJstDate(ms: number): string {
  const jst = new Date(ms + JST_OFFSET_MS)
  const date = [
    pad(jst.getUTCFullYear(), 4),
    pad(jst.getUTCMonth() + 1, 2),
    pad(jst.getUTCDate(), 2)
  ].join("-")
  const time = [
    pad(jst.getUTCHours(), 2),
    pad(jst.getUTCMinutes(), 2),
    pad(jst.getUTCSeconds(), 2)
  ].join(":")
  return `${date}T${time}+0900`
}

/** Returns null when the marker has no region index for `profile` and thus cannot be drawn. */
export function toRawMarkerItem(
  marker: BwMarker,
  profile: FontProfile
): RawMarkerItem | null {
  const locator = marker.locator.byProfile[profile]
  if (locator === undefined) return null

  return {
    id: marker.id,
    epubcfi: marker.locator.epubcfi,
    text: marker.text,
    memo: marker.memo,
    color: marker.color,
    shape: "rect",
    date: epochMsToJstDate(marker.createdAt),
    pr: marker.progress,
    appendix: {
      browser: {
        sidx: locator.sidx,
        sFile: locator.sFile,
        eidx: locator.eidx,
        eFile: locator.eFile,
        position: collectPositions(marker.locator.byProfile)
      }
    }
  }
}

/** Every known profile position is emitted so a font change does not drop the others. */
function collectPositions(
  byProfile: MarkerLocator["byProfile"]
): { readonly [P in FontProfile]?: string } {
  const position: { -readonly [P in FontProfile]?: string } = {}
  for (const profile of FONT_PROFILES) {
    const value = byProfile[profile]?.position
    if (value !== undefined) position[profile] = value
  }
  return position
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, "0")
}
