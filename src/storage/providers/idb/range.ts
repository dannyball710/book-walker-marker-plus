import type { FontProfile, MarkerQuery } from "~/core/marker/types"
import { assertProfiledQuery } from "~/storage/provider"

/**
 * An IndexedDB key path is a sequence of `.`-separated ECMAScript identifiers, so
 * `x-large_default` cannot appear in one. The `loc` map is keyed by these tokens
 * instead; `FontProfile` itself stays exactly as the viewer writes it, and the
 * conversion happens only at this storage boundary.
 */
const PROFILE_KEY = {
  small_default: "small_default",
  normal_default: "normal_default",
  large_default: "large_default",
  "x-large_default": "x_large_default"
} as const satisfies { readonly [P in FontProfile]: string }

export type ProfileKey = (typeof PROFILE_KEY)[FontProfile]

export function profileKey(profile: FontProfile): ProfileKey {
  return PROFILE_KEY[profile]
}

export type ProfileIndexName = `by-profile-${ProfileKey}`

export function profileIndexName(profile: FontProfile): ProfileIndexName {
  return `by-profile-${profileKey(profile)}`
}

export type MarkerRangeSpec =
  | {
      readonly index: ProfileIndexName
      readonly lower: readonly [string, string, number]
      readonly upper: readonly [string, string, number]
    }
  | { readonly index: "by-book"; readonly key: string }

/** Picks the narrowest index a query can use; without a chapter that is the whole book. */
export function buildMarkerRange(query: MarkerQuery): MarkerRangeSpec {
  assertProfiledQuery(query)
  if (query.profile === undefined || query.file === undefined) {
    return { index: "by-book", key: query.bookId }
  }
  return {
    index: profileIndexName(query.profile),
    lower: [
      query.bookId,
      query.file,
      query.sidxFrom ?? Number.NEGATIVE_INFINITY
    ],
    upper: [query.bookId, query.file, query.sidxTo ?? Number.POSITIVE_INFINITY]
  }
}
