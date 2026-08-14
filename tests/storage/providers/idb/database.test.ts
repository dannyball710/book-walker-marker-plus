/**
 * Opens a real IndexedDB (fake-indexeddb). The pure-function tests around it cannot
 * catch a schema that the database itself rejects — an illegal index key path shipped
 * past 36 green tests exactly because nothing here ever called openBwmDb().
 */
import "fake-indexeddb/auto"

import { openDB } from "idb"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { FONT_PROFILES, type BwMarker } from "~/core/marker/types"

const DB_NAME = "bwm"

function marker(overrides: Partial<BwMarker> = {}): BwMarker {
  return {
    id: "m1",
    bookId: "book-1",
    bookTitle: "テスト本",
    text: "本文",
    memo: "",
    color: "rgba(255,255,35,0.588235)",
    locator: {
      epubcfi: "epubcfi(/6/8!/4/2/10,/1:0,/1:7)",
      capturedProfile: "normal_default",
      byProfile: {
        normal_default: {
          sFile: "ch-01.xhtml",
          sidx: 20,
          eFile: "ch-01.xhtml",
          eidx: 22
        }
      }
    },
    progress: 10,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides
  }
}

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onblocked = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

async function loadStores() {
  vi.resetModules()
  const schema = await import("~/storage/providers/idb/schema")
  const { IdbMarkerStore } = await import(
    "~/storage/providers/idb/marker-store"
  )
  return {
    openBwmDb: schema.openBwmDb,
    markers: new IdbMarkerStore("idb")
  }
}

let open: Awaited<ReturnType<typeof loadStores>> | null = null

beforeEach(async () => {
  await deleteDatabase()
  open = await loadStores()
})

afterEach(async () => {
  if (open !== null) {
    ;(await open.openBwmDb()).close()
    open = null
  }
  await deleteDatabase()
})

describe("openBwmDb", () => {
  it("creates every profile index, including the one whose name has a hyphen", async () => {
    const db = await open!.openBwmDb()
    const names = [
      ...db.transaction("markers").store.indexNames
    ] as readonly string[]

    // x-large_default cannot appear in a key path; the index must exist anyway
    expect(names).toContain("by-profile-x_large_default")
    expect(names).toHaveLength(FONT_PROFILES.length + 2)
  })

  it("survives a second open, so the migration is not re-run destructively", async () => {
    await open!.markers.put(marker())
    ;(await open!.openBwmDb()).close()

    const reopened = await loadStores()
    expect(await reopened.markers.get("m1")).not.toBeNull()
    ;(await reopened.openBwmDb()).close()
  })

  it("has nowhere to keep a conversation, which is the whole point", async () => {
    // The reader asked for chat history not to be stored. A store existing at all is
    // what would let it come back, so the schema is asserted, not the write path.
    const db = await open!.openBwmDb()

    expect([...db.objectStoreNames]).toEqual(["markers", "settings"])
  })
})

describe("IdbMarkerStore", () => {
  it("round-trips a marker without leaking the denormalised index fields", async () => {
    const original = marker()
    await open!.markers.put(original)

    expect(await open!.markers.get("m1")).toEqual(original)
  })

  it("narrows a query to one chapter of one profile", async () => {
    await open!.markers.put(marker())
    await open!.markers.put(
      marker({
        id: "m2",
        locator: {
          epubcfi: "cfi-2",
          capturedProfile: "normal_default",
          byProfile: {
            normal_default: {
              sFile: "ch-02.xhtml",
              sidx: 5,
              eFile: "ch-02.xhtml",
              eidx: 9
            }
          }
        }
      })
    )

    const inChapter = await open!.markers.list({
      bookId: "book-1",
      profile: "normal_default",
      file: "ch-01.xhtml"
    })

    expect(inChapter.map((entry) => entry.id)).toEqual(["m1"])
  })

  it("honours the sidx bounds inside a chapter", async () => {
    await open!.markers.put(marker())

    const before = await open!.markers.list({
      bookId: "book-1",
      profile: "normal_default",
      file: "ch-01.xhtml",
      sidxFrom: 0,
      sidxTo: 19
    })
    const covering = await open!.markers.list({
      bookId: "book-1",
      profile: "normal_default",
      file: "ch-01.xhtml",
      sidxFrom: 20,
      sidxTo: 25
    })

    expect(before).toEqual([])
    expect(covering.map((entry) => entry.id)).toEqual(["m1"])
  })

  it("indexes every profile a marker has a locator for, not only the captured one", async () => {
    await open!.markers.put(
      marker({
        locator: {
          epubcfi: "cfi-1",
          capturedProfile: "normal_default",
          byProfile: {
            normal_default: {
              sFile: "ch-01.xhtml",
              sidx: 20,
              eFile: "ch-01.xhtml",
              eidx: 22
            },
            "x-large_default": {
              sFile: "ch-01.xhtml",
              sidx: 44,
              eFile: "ch-01.xhtml",
              eidx: 61
            }
          }
        }
      })
    )

    const backfilled = await open!.markers.list({
      bookId: "book-1",
      profile: "x-large_default",
      file: "ch-01.xhtml",
      sidxFrom: 40,
      sidxTo: 70
    })

    expect(backfilled.map((entry) => entry.id)).toEqual(["m1"])
  })

  it("keeps a marker with no locator for the queried profile reachable through by-book", async () => {
    await open!.markers.put(marker())

    const narrowed = await open!.markers.list({
      bookId: "book-1",
      profile: "large_default",
      file: "ch-01.xhtml"
    })

    expect(narrowed).toEqual([])
    expect((await open!.markers.listByBook("book-1")).map((e) => e.id)).toEqual([
      "m1"
    ])
  })

  it("removes a marker", async () => {
    await open!.markers.put(marker())
    await open!.markers.remove("m1")

    expect(await open!.markers.get("m1")).toBeNull()
  })
})

/** A v1 database: no profile indexes, records without `loc`, and a `chats` store. */
async function seedLegacyDatabase(): Promise<void> {
  const v1 = await openDB(DB_NAME, 1, {
    upgrade(db) {
      const markers = db.createObjectStore("markers", { keyPath: "id" })
      markers.createIndex("by-book", "bookId")
      markers.createIndex("by-book-updated", ["bookId", "updatedAt"])
      const chats = db.createObjectStore("chats", { keyPath: "id" })
      chats.createIndex("by-marker-created", ["markerId", "createdAt"])
      db.createObjectStore("settings", { keyPath: "key" })
    }
  })
  await v1.put("markers", marker())
  await v1.put("chats", {
    id: "c1",
    markerId: "m1",
    role: "user",
    content: "なぜ？",
    createdAt: 1
  })
  v1.close()
}

describe("upgrading an existing database", () => {
  beforeEach(async () => {
    ;(await open!.openBwmDb()).close()
    await deleteDatabase()
    await seedLegacyDatabase()
  })

  it("rewrites existing records so they reach the new profile indexes", async () => {
    const upgraded = await loadStores()
    const narrowed = await upgraded.markers.list({
      bookId: "book-1",
      profile: "normal_default",
      file: "ch-01.xhtml"
    })

    expect(narrowed.map((entry) => entry.id)).toEqual(["m1"])
    expect(narrowed[0]).toEqual(marker())
    ;(await upgraded.openBwmDb()).close()
  })

  it("deletes the conversations an earlier build had already written to disk", async () => {
    // Stopping the writes is not enough: what the reader asked us not to keep is
    // already on their machine, and only dropping the store actually removes it.
    const upgraded = await loadStores()
    const db = await upgraded.openBwmDb()

    expect([...db.objectStoreNames]).toEqual(["markers", "settings"])
    db.close()
  })
})
