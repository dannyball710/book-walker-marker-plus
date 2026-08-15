import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { t } from "~/core/i18n"
import type { BwMarker } from "~/core/marker/types"
import type {
  MarkerCreateResponse,
  MarkerGetResponse,
  MarkerListResponse,
  SelectionGetResponse
} from "~/core/messaging/protocol"
import {
  bookContext,
  CID,
  deleteDatabase,
  expectOk,
  invoke,
  selection,
  stubChrome,
  type BgResponse,
  type ChromeSpy
} from "./harness"

const MEMO = "{漢字|かんじ} のメモ"
const COLOR = "rgba(255,255,35,0.588235)" as const

async function loadHandlers() {
  vi.resetModules()
  const [
    bookCtx,
    selectionCaptured,
    selectionGet,
    selectionClear,
    markerCreate,
    markerList,
    markerGet,
    markerUpsert,
    markerDelete
  ] = await Promise.all([
    import("~/background/messages/book-context"),
    import("~/background/messages/selection-captured"),
    import("~/background/messages/selection-get"),
    import("~/background/messages/selection-clear"),
    import("~/background/messages/marker-create"),
    import("~/background/messages/marker-list"),
    import("~/background/messages/marker-get"),
    import("~/background/messages/marker-upsert"),
    import("~/background/messages/marker-delete")
  ])
  const schema = await import("~/storage/providers/idb/schema")
  return {
    // the module-level connection has to be closed or deleteDatabase() blocks forever
    close: async () => (await schema.openBwmDb()).close(),
    bookContext: bookCtx.default,
    selectionCaptured: selectionCaptured.default,
    selectionGet: selectionGet.default,
    selectionClear: selectionClear.default,
    markerCreate: markerCreate.default,
    markerList: markerList.default,
    markerGet: markerGet.default,
    markerUpsert: markerUpsert.default,
    markerDelete: markerDelete.default
  }
}

let handlers: Awaited<ReturnType<typeof loadHandlers>>
let spy: ChromeSpy

beforeEach(async () => {
  await deleteDatabase()
  spy = stubChrome()
  handlers = await loadHandlers()
})

afterEach(async () => {
  // let the fire-and-forget profile backfill settle before the world disappears
  await new Promise((resolve) => setTimeout(resolve, 0))
  await handlers.close()
  vi.unstubAllGlobals()
  await deleteDatabase()
})

async function reportContext(): Promise<void> {
  await invoke(handlers.bookContext, {
    name: "book-context",
    body: { context: bookContext }
  })
}

async function createMarker(): Promise<BwMarker> {
  await reportContext()
  await invoke(handlers.selectionCaptured, {
    name: "selection-captured",
    body: { selection },
    tabId: 7
  })
  const created: BgResponse<MarkerCreateResponse> = await invoke(
    handlers.markerCreate,
    { name: "marker-create", body: { selection, memo: MEMO, color: COLOR } }
  )
  return expectOk(created).marker
}

describe("creating a marker", () => {
  it("stores the selection, opens the panel and pushes it, all from one message", async () => {
    await reportContext()

    await invoke(handlers.selectionCaptured, {
      name: "selection-captured",
      body: { selection },
      tabId: 7
    })

    expect(spy.opened).toEqual([7])
    expect(spy.sent).toEqual([
      {
        type: "panel/pending-selection",
        selection,
        context: bookContext
      }
    ])
  })

  it("hands the pending selection back with the book title the selection lacks", async () => {
    await reportContext()
    await invoke(handlers.selectionCaptured, {
      name: "selection-captured",
      body: { selection },
      tabId: 7
    })

    const response: BgResponse<SelectionGetResponse> = await invoke(
      handlers.selectionGet,
      { name: "selection-get" }
    )

    expect(expectOk(response)).toEqual({ selection, context: bookContext })
  })

  it("keeps the selection when the panel refuses to open, so nothing is lost", async () => {
    await reportContext()
    spy.failSidePanel = true

    const response = await invoke(handlers.selectionCaptured, {
      name: "selection-captured",
      body: { selection },
      tabId: 7
    })

    expect(response).toEqual({ ok: true, data: null })
    const pending: BgResponse<SelectionGetResponse> = await invoke(
      handlers.selectionGet,
      { name: "selection-get" }
    )
    expect(expectOk(pending).selection).toEqual(selection)
  })

  it("builds the marker from the selection, without asking the viewer for anything", async () => {
    const marker = await createMarker()

    expect(marker.bookId).toBe(CID)
    // the title is the one thing the selection does not carry
    expect(marker.bookTitle).toBe(bookContext.bookTitle)
    expect(marker.text).toBe(selection.text)
    expect(marker.memo).toBe(MEMO)
    expect(marker.color).toBe(COLOR)
    expect(marker.locator.epubcfi).toBe(selection.cfi)
    // the region indexes only mean something in the profile /cri measured them in
    expect(marker.locator.capturedProfile).toBe("normal_default")
    expect(marker.locator.byProfile.normal_default).toEqual({
      sFile: selection.file,
      sidx: selection.sidx,
      eFile: selection.file,
      eidx: selection.eidx
    })
  })

  it("stores the captured text immediately before and after the selection", async () => {
    await reportContext()
    const contextualSelection = {
      ...selection,
      contextText: `直前の十文字${selection.text}直後の十文字`
    }
    const response: BgResponse<MarkerCreateResponse> = await invoke(
      handlers.markerCreate,
      {
        name: "marker-create",
        body: {
          selection: contextualSelection,
          memo: MEMO,
          color: COLOR
        }
      }
    )

    expect(expectOk(response).marker).toMatchObject({
      contextText: `直前の十文字${selection.text}直後の十文字`
    })
  })

  it("omits the position hint, which only the viewer's own engine can produce", async () => {
    const locator = (await createMarker()).locator.byProfile.normal_default

    // exactOptionalPropertyTypes: the key must be absent, not set to undefined, or the
    // /gm payload would carry `position: { normal_default: undefined }`.
    expect(locator !== undefined && "position" in locator).toBe(false)
  })

  it("clears the pending selection once it became a marker, so it cannot be created twice", async () => {
    await createMarker()

    const response: BgResponse<SelectionGetResponse> = await invoke(
      handlers.selectionGet,
      { name: "selection-get" }
    )

    expect(expectOk(response)).toEqual({ selection: null, context: null })
  })

  it("clears a selection the reader dismissed instead of marking", async () => {
    await reportContext()
    await invoke(handlers.selectionCaptured, {
      name: "selection-captured",
      body: { selection },
      tabId: 7
    })

    await invoke(handlers.selectionClear, { name: "selection-clear" })

    const response: BgResponse<SelectionGetResponse> = await invoke(
      handlers.selectionGet,
      { name: "selection-get" }
    )
    expect(expectOk(response).selection).toBeNull()
  })

  it("refuses to invent a book title when no context was reported", async () => {
    const response: BgResponse<MarkerCreateResponse> = await invoke(
      handlers.markerCreate,
      { name: "marker-create", body: { selection, memo: MEMO, color: COLOR } }
    )

    expect(response.ok).toBe(false)
    expect(response.ok ? "" : response.error).toBe(t("errorBookContextMissing"))
  })
})

describe("reading markers", () => {
  it("returns the whole book when no chapter is named", async () => {
    const created = await createMarker()

    const response: BgResponse<MarkerListResponse> = await invoke(
      handlers.markerList,
      { name: "marker-list", body: { query: { bookId: CID } } }
    )

    expect(expectOk(response).markers.map((m) => m.id)).toEqual([created.id])
  })

  it("narrows to one chapter of one profile", async () => {
    await createMarker()

    const hit: BgResponse<MarkerListResponse> = await invoke(handlers.markerList, {
      name: "marker-list",
      body: {
        query: {
          bookId: CID,
          profile: "normal_default",
          file: "item/xhtml/p-003.xhtml"
        }
      }
    })
    const miss: BgResponse<MarkerListResponse> = await invoke(handlers.markerList, {
      name: "marker-list",
      body: {
        query: {
          bookId: CID,
          profile: "normal_default",
          file: "item/xhtml/p-009.xhtml"
        }
      }
    })

    expect(expectOk(hit).markers).toHaveLength(1)
    expect(expectOk(miss).markers).toEqual([])
  })

  it("fails a chapter query with no profile rather than answering the wrong subset", async () => {
    await createMarker()

    const response: BgResponse<MarkerListResponse> = await invoke(
      handlers.markerList,
      {
        name: "marker-list",
        body: { query: { bookId: CID, file: "item/xhtml/p-003.xhtml" } }
      }
    )

    expect(response.ok).toBe(false)
    expect(response.ok ? "" : response.error).toContain("MarkerQuery.profile")
  })
})

describe("updating and deleting a marker", () => {
  it("echoes the stored marker, not the one that was sent", async () => {
    const created = await createMarker()
    const edited: BwMarker = { ...created, memo: "edited note", updatedAt: 0 }

    const response: BgResponse<{ marker: BwMarker }> = await invoke(
      handlers.markerUpsert,
      { name: "marker-upsert", body: { marker: edited } }
    )
    const echoed = expectOk(response).marker

    // the panel writes this back into its state, so a stale updatedAt would drift
    expect(echoed.updatedAt).not.toBe(0)
    const fetched: BgResponse<MarkerGetResponse> = await invoke(
      handlers.markerGet,
      { name: "marker-get", body: { id: created.id } }
    )
    expect(expectOk(fetched).marker).toEqual(echoed)
  })

  it("removes the marker, which is all a deletion has to clean up", async () => {
    // Conversations are not stored anywhere, so there is no second record to chase.
    const created = await createMarker()

    await invoke(handlers.markerDelete, {
      name: "marker-delete",
      body: { id: created.id }
    })

    const fetched: BgResponse<MarkerGetResponse> = await invoke(
      handlers.markerGet,
      { name: "marker-get", body: { id: created.id } }
    )
    expect(expectOk(fetched).marker).toBeNull()
  })
})
