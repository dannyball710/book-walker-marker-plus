import type { BwMarker } from "~/core/marker/types"

function searchable(text: string): string {
  return text.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim()
}

/** Search both the original passage and the note as the reader sees it. */
export function markerMatchesQuery(marker: BwMarker, query: string): boolean {
  const needle = searchable(query)
  if (needle === "") {
    return true
  }

  const visibleMemo = marker.memo.replace(/\{([^|{}]+)\|[^{}]+\}/g, "$1")
  const readingMemo = marker.memo.replace(/\{[^|{}]+\|([^{}]+)\}/g, "$1")
  return [marker.text, marker.memo, visibleMemo, readingMemo].some((value) =>
    searchable(value).includes(needle)
  )
}
