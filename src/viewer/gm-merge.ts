/**
 * Additive injection into a /gm response.
 *
 * The viewer's markers are appended to, never re-encoded. Our schema models only
 * the browser-created shape, so validating them would both strip unmodelled fields
 * and let a single foreign marker (one made in the BOOK☆WALKER app, whose appendix
 * has no `browser`) abandon the whole injection. Only the envelope is checked.
 */
import type { RawMarkerItem } from "~/core/marker/types"

export type GmMerge =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly reason: string }

export function mergeGetMarkerResponse(
  text: string,
  ours: readonly RawMarkerItem[]
): GmMerge {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    return { ok: false, reason: describe(error) }
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, reason: "/gm response is not an object" }
  }
  const markers: unknown = Reflect.get(parsed, "markers")
  if (!Array.isArray(markers)) {
    return { ok: false, reason: "/gm response has no markers array" }
  }

  const known = new Set<string>()
  for (const marker of markers) {
    if (typeof marker !== "object" || marker === null) continue
    const id: unknown = Reflect.get(marker, "id")
    if (typeof id === "string") known.add(id)
  }

  const extra = ours.filter((marker) => !known.has(marker.id))
  if (extra.length === 0) return { ok: true, text }
  return {
    ok: true,
    text: JSON.stringify({ ...parsed, markers: [...markers, ...extra] })
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
