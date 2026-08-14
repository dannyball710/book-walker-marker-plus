import { openDB, unwrap, type DBSchema, type IDBPDatabase } from "idb"

import { FONT_PROFILES, type BwMarker } from "~/core/marker/types"
import {
  profileIndexName,
  profileKey,
  type ProfileIndexName,
  type ProfileKey
} from "~/storage/providers/idb/range"

const DB_NAME = "bwm"
const DB_VERSION = 3

interface IndexLocator {
  readonly sFile: string
  readonly sidx: number
}

/**
 * An index keyPath is a static string and cannot follow `byProfile[<profile>]`, so each
 * profile's file/sidx are denormalised onto the record under a fixed key and indexed
 * separately. A profile the marker has no locator for is simply absent from `loc`, which
 * drops the record out of that profile's index — `by-book` stays its path.
 */
export interface StoredMarker extends BwMarker {
  readonly loc?: { readonly [K in ProfileKey]?: IndexLocator }
}

type ProfileIndexes = { [K in ProfileIndexName]: [string, string, number] }

export interface BwmDb extends DBSchema {
  markers: {
    key: string
    value: StoredMarker
    indexes: ProfileIndexes & {
      "by-book": string
      "by-book-updated": [string, number]
    }
  }
  settings: {
    key: string
    value: { readonly key: string; readonly json: string }
  }
}

export function toStored(marker: BwMarker): StoredMarker {
  const loc: { [K in ProfileKey]?: IndexLocator } = {}
  for (const profile of FONT_PROFILES) {
    const entry = marker.locator.byProfile[profile]
    if (entry !== undefined) {
      loc[profileKey(profile)] = { sFile: entry.sFile, sidx: entry.sidx }
    }
  }
  return { ...marker, loc }
}

export function fromStored(stored: StoredMarker): BwMarker {
  const { loc, ...marker } = stored
  return marker
}

let dbPromise: Promise<IDBPDatabase<BwmDb>> | null = null

export function openBwmDb(): Promise<IDBPDatabase<BwmDb>> {
  if (dbPromise === null) {
    dbPromise = openDB<BwmDb>(DB_NAME, DB_VERSION, {
      async upgrade(db, oldVersion, _newVersion, tx) {
        if (oldVersion < 1) {
          const markers = db.createObjectStore("markers", { keyPath: "id" })
          markers.createIndex("by-book", "bookId")
          markers.createIndex("by-book-updated", ["bookId", "updatedAt"])

          db.createObjectStore("settings", { keyPath: "key" })
        }

        if (oldVersion < 2) {
          const markers = tx.objectStore("markers")
          for (const profile of FONT_PROFILES) {
            const key = profileKey(profile)
            markers.createIndex(profileIndexName(profile), [
              "bookId",
              `loc.${key}.sFile`,
              `loc.${key}.sidx`
            ])
          }
          // v1 records predate `loc`; rewrite them so they reach the new indexes.
          for (let c = await markers.openCursor(); c !== null; c = await c.continue()) {
            await c.update(toStored(fromStored(c.value)))
          }
        }

        if (oldVersion < 3) {
          // Conversations are no longer kept anywhere. Dropping the store rather than
          // merely not writing to it is the point: an earlier build already wrote the
          // reader's chats to disk, and leaving them there keeps storing exactly what
          // they asked us to stop storing. `chats` is gone from BwmDb, so the deletion
          // goes through the untyped native handle.
          const native = unwrap(db)
          if (native.objectStoreNames.contains("chats")) {
            native.deleteObjectStore("chats")
          }
        }
      }
    }).catch((error: unknown) => {
      dbPromise = null
      throw error
    })
  }
  return dbPromise
}
