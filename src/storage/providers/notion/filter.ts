import type { MarkerQuery } from "~/core/marker/types"
import { assertProfiledQuery } from "~/storage/provider"
import { PROP } from "~/storage/providers/notion/mapping"

export type NotionCondition =
  | {
      readonly property: string
      readonly rich_text: { readonly equals: string }
    }
  | {
      readonly property: string
      readonly select: { readonly equals: string }
    }
  | {
      readonly property: string
      readonly number:
        | { readonly greater_than_or_equal_to: number }
        | { readonly less_than_or_equal_to: number }
    }

export interface NotionFilter {
  readonly and: readonly NotionCondition[]
}

/**
 * Optional bounds are omitted rather than sent as unbounded placeholders.
 *
 * A Notion row stores only the captured profile's file/sidx, so it is answerable under
 * exactly one profile. Narrowing therefore also matches on `capturedProfile`: a marker
 * captured under another profile is invisible to a profile-narrowed Notion query until
 * it is re-saved, whereas idb indexes every profile a marker has a locator for.
 */
export function buildNotionQueryFilter(query: MarkerQuery): NotionFilter {
  assertProfiledQuery(query)
  const and: NotionCondition[] = [
    { property: PROP.bookId, rich_text: { equals: query.bookId } }
  ]
  if (query.profile !== undefined && query.file !== undefined) {
    and.push({
      property: PROP.capturedProfile,
      select: { equals: query.profile }
    })
  }
  if (query.file !== undefined) {
    and.push({ property: PROP.file, rich_text: { equals: query.file } })
  }
  if (query.sidxFrom !== undefined) {
    and.push({
      property: PROP.sidx,
      number: { greater_than_or_equal_to: query.sidxFrom }
    })
  }
  if (query.sidxTo !== undefined) {
    and.push({
      property: PROP.sidx,
      number: { less_than_or_equal_to: query.sidxTo }
    })
  }
  return { and }
}

export function markerIdFilter(markerId: string): NotionFilter {
  return {
    and: [{ property: PROP.markerId, rich_text: { equals: markerId } }]
  }
}
