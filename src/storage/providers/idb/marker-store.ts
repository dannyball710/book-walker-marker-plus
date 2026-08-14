import type { BwMarker, MarkerQuery } from "~/core/marker/types"
import { buildMarkerRange } from "~/storage/providers/idb/range"
import { fromStored, openBwmDb, toStored } from "~/storage/providers/idb/schema"
import type { MarkerStore } from "~/storage/provider"

export class IdbMarkerStore implements MarkerStore {
  constructor(readonly kind: string) {}

  async list(query: MarkerQuery): Promise<readonly BwMarker[]> {
    const db = await openBwmDb()
    const spec = buildMarkerRange(query)
    if (spec.index === "by-book") {
      const rows = await db.getAllFromIndex(
        "markers",
        "by-book",
        spec.key,
        query.limit
      )
      return rows.map(fromStored)
    }
    const range = IDBKeyRange.bound([...spec.lower], [...spec.upper])
    const rows = await db.getAllFromIndex(
      "markers",
      spec.index,
      range,
      query.limit
    )
    return rows.map(fromStored)
  }

  async get(id: string): Promise<BwMarker | null> {
    const db = await openBwmDb()
    const row = await db.get("markers", id)
    return row === undefined ? null : fromStored(row)
  }

  async put(marker: BwMarker): Promise<void> {
    const db = await openBwmDb()
    await db.put("markers", toStored(marker))
  }

  async remove(id: string): Promise<void> {
    const db = await openBwmDb()
    await db.delete("markers", id)
  }

  async listByBook(bookId: string): Promise<readonly BwMarker[]> {
    const db = await openBwmDb()
    const rows = await db.getAllFromIndex("markers", "by-book", bookId)
    return rows.map(fromStored)
  }
}
