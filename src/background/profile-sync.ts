/**
 * Font profile resilience.
 * `sidx`/`eidx` are only valid for the profile they were captured under, so a
 * font change leaves every marker without an index for the new profile. The
 * `epubcfi` stays canonical, and `/ric` converts it back into region indexes.
 */
import { listMarkers, upsertMarker } from "~/background/marker-service"
import { parseRicResponse } from "~/core/bwapi/schema"
import { buildRicUrl, fontProfileOf } from "~/core/bwapi/urls"
import type {
  BookContext,
  BwMarker,
  FontProfile,
  ProfileLocator,
  RicResponse
} from "~/core/marker/types"

export interface BackfillResult {
  readonly updated: number
  readonly failed: number
}

export function mergeProfileLocator(
  marker: BwMarker,
  profile: FontProfile,
  ric: RicResponse
): BwMarker {
  // the span may cross files; `pages` is ordered, so its tail carries the end file
  const lastPage = ric.pages[ric.pages.length - 1]
  const locator: ProfileLocator = {
    sFile: ric.file,
    sidx: ric.sidx,
    eFile: lastPage?.file ?? ric.file,
    eidx: ric.eidx
  }

  const byProfile: { [P in FontProfile]?: ProfileLocator } = {
    ...marker.locator.byProfile
  }
  byProfile[profile] = locator

  // `updatedAt` is deliberately untouched: upsertMarker stamps it on write.
  return {
    ...marker,
    locator: { ...marker.locator, byProfile }
  }
}

/** A stalled request would otherwise wedge the whole book's sweep, which is serialised. */
const RIC_TIMEOUT_MS = 15_000

export type RegionIndexFetcher = (
  marker: BwMarker,
  context: BookContext,
  signal: AbortSignal | undefined
) => Promise<RicResponse>

const fetchRegionIndex: RegionIndexFetcher = async (marker, context, signal) => {
  const url = buildRicUrl({
    cid: context.cid,
    u1: context.u1,
    bid: context.bid,
    cfi: marker.locator.epubcfi,
    sfs: context.sfs,
    sff: context.sff
  })
  const timeout = AbortSignal.timeout(RIC_TIMEOUT_MS)
  const response = await fetch(url, {
    signal: signal === undefined ? timeout : AbortSignal.any([signal, timeout])
  })
  if (!response.ok) {
    throw new Error(`/ric responded with HTTP ${response.status}`)
  }
  return parseRicResponse(await response.json())
}

/**
 * Fills in `locator.byProfile[<current profile>]` for every marker of the book
 * that lacks it. Requests are serialised: this hits the same origin the viewer
 * is already using. Re-injection is free — `/gm` reads the store on next load.
 */
export async function backfillProfile(input: {
  readonly context: BookContext
  readonly signal?: AbortSignal
  /** injectable so the sweep's counting and abort behaviour can be tested without the network */
  readonly fetchRic?: RegionIndexFetcher
}): Promise<BackfillResult> {
  const { context, signal } = input
  const fetchRic = input.fetchRic ?? fetchRegionIndex
  const profile = fontProfileOf(context.sfs, context.sff)
  const markers = await listMarkers({ bookId: context.cid })
  const pending = markers.filter(
    (marker) => marker.locator.byProfile[profile] === undefined
  )

  let updated = 0
  let failed = 0
  for (const marker of pending) {
    if (signal?.aborted) {
      break
    }
    try {
      const ric = await fetchRic(marker, context, signal)
      await upsertMarker(mergeProfileLocator(marker, profile, ric))
      updated += 1
    } catch (error) {
      // one unreachable marker must not abandon the rest of the book
      failed += 1
      const reason = error instanceof Error ? error.message : "unknown error"
      console.warn(
        `[bwm] ${profile} backfill failed for marker ${marker.id} (${reason})`
      )
    }
  }
  return { updated, failed }
}
