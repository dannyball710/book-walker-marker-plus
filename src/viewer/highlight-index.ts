/**
 * Pure hit-testing helpers for the viewer's highlight rects.
 * Kept free of chrome/DOM APIs so they can be unit-tested.
 */
import type { BwMarker, FontProfile } from "~/core/marker/types"

export const HIGHLIGHT_ID_PREFIX = "highlight_"

/** Screen-space box, a structural subset of DOMRect. */
export interface HitBox {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

export interface HighlightRect {
  readonly regionIndex: number
  readonly box: HitBox
}

/**
 * `highlight_<regionIndex>` on <rect>; the per-page <svg id="highlight_group_11">
 * shares the prefix and must not be read as a region index.
 */
export function regionIndexFromRectId(id: string): number | null {
  const match = /^highlight_(\d+)$/.exec(id)
  if (match === null) return null
  const digits = match[1]
  if (digits === undefined) return null
  return Number(digits)
}

/**
 * The region indexes a marker owns that nothing has drawn yet. The viewer paints the
 * markers it knew about when it loaded and never asks again, so one created during the
 * session owns every index in its range and has none of them on screen.
 */
export function unpaintedRegions(
  marker: BwMarker,
  profile: FontProfile,
  painted: ReadonlySet<number>
): readonly number[] {
  const locator = marker.locator.byProfile[profile]
  if (locator === undefined) return []
  const missing: number[] = []
  for (let index = locator.sidx; index <= locator.eidx; index += 1) {
    if (!painted.has(index)) missing.push(index)
  }
  return missing
}

export function hitTestRegion(
  rects: readonly HighlightRect[],
  x: number,
  y: number
): number | null {
  for (const rect of rects) {
    const { box } = rect
    if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) {
      return rect.regionIndex
    }
  }
  return null
}

/**
 * Region indexes are profile-dependent, so a marker only
 * participates when it has a cached locator for the profile in effect.
 * Overlapping markers resolve to the narrowest, then the most recently updated.
 */
export function findMarkerAtRegion(
  markers: readonly BwMarker[],
  regionIndex: number,
  profile: FontProfile
): BwMarker | null {
  let best: BwMarker | null = null
  let bestSpan = Number.POSITIVE_INFINITY
  for (const marker of markers) {
    const locator = marker.locator.byProfile[profile]
    if (locator === undefined) continue
    if (regionIndex < locator.sidx || regionIndex > locator.eidx) continue
    const span = locator.eidx - locator.sidx
    if (best === null || span < bestSpan) {
      best = marker
      bestSpan = span
      continue
    }
    if (span === bestSpan && marker.updatedAt > best.updatedAt) {
      best = marker
    }
  }
  return best
}
