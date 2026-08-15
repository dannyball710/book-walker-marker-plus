import * as z from "zod"

import { PENDING_FOCUS_KEY } from "~/background/message-types"
import { fontProfileOf } from "~/core/bwapi/urls"
import { t } from "~/core/i18n"
import type {
  BookContext,
  BwMarker,
  FontProfile,
  MarkerColor,
  MarkerQuery,
  ProfileLocator,
  SelectionCaptured
} from "~/core/marker/types"
import { getMarkerStore } from "~/storage"

const PENDING_SELECTION_KEY = "bwm:pending-selection"

const bookContextKey = (cid: string): string => `bwm:book-context:${cid}`

const fontSizeSchema = z.enum(["small", "normal", "large", "x-large"])
const fontFaceSchema = z.literal("default")

const selectionSchema = z.object({
  cid: z.string(),
  file: z.string(),
  sidx: z.number(),
  eidx: z.number(),
  sfs: fontSizeSchema,
  sff: fontFaceSchema,
  cfi: z.string(),
  text: z.string(),
  contextText: z.string().optional()
})

const bookContextSchema = z.object({
  cid: z.string(),
  bookTitle: z.string(),
  u1: z.string(),
  bid: z.string(),
  sfs: fontSizeSchema,
  sff: fontFaceSchema
})

async function readSession(key: string): Promise<unknown> {
  const stored = await chrome.storage.session.get(key)
  const raw: unknown = stored[key]
  return raw
}

export async function listMarkers(
  query: MarkerQuery
): Promise<readonly BwMarker[]> {
  const store = await getMarkerStore()
  return store.list(query)
}

export async function getMarker(id: string): Promise<BwMarker | null> {
  const store = await getMarkerStore()
  return store.get(id)
}

/** The single write path, so `updatedAt` is stamped exactly once and the caller sees the stored value. */
export async function upsertMarker(marker: BwMarker): Promise<BwMarker> {
  const stored: BwMarker = { ...marker, updatedAt: Date.now() }
  const store = await getMarkerStore()
  await store.put(stored)
  return stored
}

export async function deleteMarker(id: string): Promise<void> {
  const store = await getMarkerStore()
  await store.remove(id)
}

/**
 * The only creation path: the extension builds the marker from the captured selection,
 * so nothing is written to Book Walker and no viewer round-trip has to be waited for.
 * The selection's own font profile is the captured one — it is what /cri measured the
 * region indexes in. A `position` hint only exists for markers the viewer's engine
 * produced, so this locator has none.
 */
export async function createFromSelection(input: {
  readonly selection: SelectionCaptured
  readonly memo: string
  readonly color: MarkerColor
}): Promise<BwMarker> {
  const { selection } = input
  const ctx = await getBookContext(selection.cid)
  if (ctx === null) {
    throw new Error(t("errorBookContextMissing"))
  }

  const profile = fontProfileOf(selection.sfs, selection.sff)
  const byProfile: { -readonly [P in FontProfile]?: ProfileLocator } = {}
  byProfile[profile] = {
    sFile: selection.file,
    sidx: selection.sidx,
    eFile: selection.file,
    eidx: selection.eidx
  }
  const now = Date.now()

  const marker = await upsertMarker({
    id: crypto.randomUUID(),
    bookId: selection.cid,
    bookTitle: ctx.bookTitle,
    text: selection.text,
    ...(selection.contextText === undefined
      ? {}
      : { contextText: selection.contextText }),
    memo: input.memo,
    color: input.color,
    locator: { epubcfi: selection.cfi, capturedProfile: profile, byProfile },
    progress: 0,
    createdAt: now,
    updatedAt: now
  })
  // The selection has become a marker; leaving it pending would let the panel
  // offer "create" again and mark the same range twice.
  await clearPendingSelection()
  return marker
}

/**
 * Transient state lives in `storage.session`: an MV3 worker loses module state.
 * A pending selection is cleared when it becomes a marker, when the panel cancels,
 * or when a newer selection replaces it — a stale one would be offered for creation
 * again and mark the same range twice.
 */
export async function setPendingSelection(
  selection: SelectionCaptured
): Promise<void> {
  await chrome.storage.session.set({ [PENDING_SELECTION_KEY]: selection })
}

export async function clearPendingSelection(): Promise<void> {
  await chrome.storage.session.remove(PENDING_SELECTION_KEY)
}

export async function getPendingSelection(): Promise<SelectionCaptured | null> {
  const parsed = selectionSchema.safeParse(
    await readSession(PENDING_SELECTION_KEY)
  )
  if (!parsed.success) return null
  const selection = parsed.data
  return {
    cid: selection.cid,
    file: selection.file,
    sidx: selection.sidx,
    eidx: selection.eidx,
    sfs: selection.sfs,
    sff: selection.sff,
    cfi: selection.cfi,
    text: selection.text,
    ...(selection.contextText === undefined
      ? {}
      : { contextText: selection.contextText })
  }
}

export async function setPendingFocus(marker: BwMarker): Promise<void> {
  await chrome.storage.session.set({ [PENDING_FOCUS_KEY]: marker })
}

export async function setBookContext(ctx: BookContext): Promise<void> {
  await chrome.storage.session.set({ [bookContextKey(ctx.cid)]: ctx })
}

export async function getBookContext(
  cid: string
): Promise<BookContext | null> {
  const parsed = bookContextSchema.safeParse(
    await readSession(bookContextKey(cid))
  )
  return parsed.success ? parsed.data : null
}
