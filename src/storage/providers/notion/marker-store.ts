import type { BwMarker, MarkerQuery } from "~/core/marker/types"
import type { MarkerStore } from "~/storage/provider"
import {
  MAX_PAGE_SIZE,
  NotionClient
} from "~/storage/providers/notion/client"
import type { NotionConfig } from "~/storage/providers/notion/config"
import {
  buildNotionQueryFilter,
  markerIdFilter,
  type NotionFilter
} from "~/storage/providers/notion/filter"
import {
  markerToNotionProperties,
  notionPagesToMarkers,
  notionPageToMarker
} from "~/storage/providers/notion/mapping"
import { createKeyMutex, type KeyMutex } from "~/storage/support/key-mutex"

export class NotionMarkerStore implements MarkerStore {
  private readonly client: NotionClient
  /** Notion has no transactions, so read-then-write on one marker must not interleave. */
  private readonly locks: KeyMutex = createKeyMutex()

  constructor(
    readonly kind: string,
    config: NotionConfig
  ) {
    this.client = new NotionClient(config)
  }

  async list(query: MarkerQuery): Promise<readonly BwMarker[]> {
    return this.collect(
      buildNotionQueryFilter(query),
      query.limit ?? Number.POSITIVE_INFINITY
    )
  }

  async listByBook(bookId: string): Promise<readonly BwMarker[]> {
    return this.collect(
      buildNotionQueryFilter({ bookId }),
      Number.POSITIVE_INFINITY
    )
  }

  async get(id: string): Promise<BwMarker | null> {
    const page = await this.client.query(markerIdFilter(id), 1, null)
    const first = page.results[0]
    return first === undefined ? null : notionPageToMarker(first)
  }

  async put(marker: BwMarker): Promise<void> {
    await this.locks.run(marker.id, async () => {
      const properties = markerToNotionProperties(marker)
      const pageId = await this.client.findPageId(markerIdFilter(marker.id))
      if (pageId === null) {
        await this.client.createPage(properties)
        return
      }
      await this.client.updatePage(pageId, properties)
    })
  }

  async remove(id: string): Promise<void> {
    await this.locks.run(id, async () => {
      const pageId = await this.client.findPageId(markerIdFilter(id))
      if (pageId !== null) {
        await this.client.archivePage(pageId)
      }
    })
  }

  private async collect(
    filter: NotionFilter,
    limit: number
  ): Promise<readonly BwMarker[]> {
    const markers: BwMarker[] = []
    let skipped = 0
    let cursor: string | null = null
    while (markers.length < limit) {
      const page = await this.client.query(
        filter,
        Math.min(limit - markers.length, MAX_PAGE_SIZE),
        cursor
      )
      const mapped = notionPagesToMarkers(page.results)
      markers.push(...mapped.markers)
      skipped += mapped.skipped
      if (!page.hasMore || page.nextCursor === null) {
        break
      }
      cursor = page.nextCursor
    }
    if (skipped > 0) {
      // Count only — a row's contents are the user's notes.
      console.warn(`[bwm] skipped ${skipped} unreadable Notion row(s)`)
    }
    return markers
  }
}
