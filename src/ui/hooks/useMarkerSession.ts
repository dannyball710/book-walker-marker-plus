import { useCallback, useEffect, useRef, useState } from "react"

import { PENDING_FOCUS_KEY } from "~/background/message-types"
import { fontProfileOf } from "~/core/bwapi/urls"
import { t } from "~/core/i18n"
import { toRawMarkerItem } from "~/core/marker/codec"
import type { BookContext, BwMarker, MarkerColor } from "~/core/marker/types"
import type { ContentCommand, PanelFocusMessage } from "~/core/messaging/protocol"
import {
  editorBookId,
  resolveEditorState,
  type EditorState
} from "~/ui/logic/editor-state"
import {
  clearPendingSelection,
  createMarker,
  deleteMarker,
  fetchMarker,
  fetchMarkers,
  upsertMarker
} from "~/ui/messages"
import { sendToViewerTab } from "~/ui/viewer-tab"

import { usePendingSelection } from "./usePendingSelection"

const LIST_LIMIT = 200

export interface MarkerDraft {
  readonly memo: string
  readonly color: MarkerColor
}

export type MarkerSaveStatus = "idle" | "saving" | "created" | "saved"

export interface MarkerSession {
  readonly state: EditorState
  readonly markers: readonly BwMarker[]
  /** book of the pending selection, the only source of its title */
  readonly bookContext: BookContext | null
  readonly error: string | null
  readonly busy: boolean
  readonly saveStatus: MarkerSaveStatus
  readonly select: (id: string) => void
  readonly save: (draft: MarkerDraft) => Promise<void>
  readonly remove: () => Promise<void>
  /** throw away a selection the user decided not to turn into a marker */
  readonly dismiss: () => Promise<void>
}

function isMarkerSnapshot(value: unknown): value is BwMarker {
  if (typeof value !== "object" || value === null) return false
  if (!("id" in value) || !("bookId" in value) || !("text" in value)) return false
  if (!("memo" in value) || !("locator" in value)) return false
  return (
    typeof value.id === "string" &&
    typeof value.bookId === "string" &&
    typeof value.text === "string" &&
    typeof value.memo === "string" &&
    typeof value.locator === "object" &&
    value.locator !== null
  )
}

function isPanelFocus(message: unknown): message is PanelFocusMessage {
  if (typeof message !== "object" || message === null) return false
  if (!("type" in message) || !("marker" in message)) return false
  return message.type === "panel/focus-marker" && isMarkerSnapshot(message.marker)
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

function viewerUpsertCommand(
  marker: BwMarker,
  context: BookContext | null
): ContentCommand {
  const preferred =
    context === null
      ? marker.locator.capturedProfile
      : fontProfileOf(context.sfs, context.sff)
  const preferredItem = toRawMarkerItem(marker, preferred)
  if (preferredItem !== null) {
    return {
      type: "content/upsert-highlight",
      bookId: marker.bookId,
      profile: preferred,
      marker: preferredItem
    }
  }

  const captured = marker.locator.capturedProfile
  const capturedItem = toRawMarkerItem(marker, captured)
  return capturedItem === null
    ? { type: "content/refresh-markers" }
    : {
        type: "content/upsert-highlight",
        bookId: marker.bookId,
        profile: captured,
        marker: capturedItem
      }
}

export function useMarkerSession(): MarkerSession {
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [focusedMarker, setFocusedMarker] = useState<BwMarker | null>(null)
  const [focusedAtVersion, setFocusedAtVersion] = useState<number | null>(null)
  const [markers, setMarkers] = useState<readonly BwMarker[]>([])
  const [busy, setBusy] = useState(false)
  const [saveStatus, setSaveStatus] = useState<MarkerSaveStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const saveFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const {
    selection,
    context: bookContext,
    version: selectionVersion,
    error: selectionError,
    refresh: refreshSelection
  } = usePendingSelection()

  // read by callbacks that outlive the render they were created in
  const versionRef = useRef(selectionVersion)
  versionRef.current = selectionVersion

  const state = resolveEditorState({
    focusedMarker,
    focusedAtVersion,
    pendingSelection: selection,
    selectionVersion
  })
  const bookId = editorBookId(state)

  useEffect(() => {
    return () => {
      if (saveFeedbackTimerRef.current !== null) {
        clearTimeout(saveFeedbackTimerRef.current)
      }
    }
  }, [])

  const updateSaveStatus = useCallback((status: MarkerSaveStatus) => {
    if (saveFeedbackTimerRef.current !== null) {
      clearTimeout(saveFeedbackTimerRef.current)
      saveFeedbackTimerRef.current = null
    }
    setSaveStatus(status)
    if (status === "created" || status === "saved") {
      saveFeedbackTimerRef.current = setTimeout(() => {
        setSaveStatus("idle")
        saveFeedbackTimerRef.current = null
      }, 1600)
    }
  }, [])

  const reloadList = useCallback((id: string) => {
    fetchMarkers({ bookId: id, limit: LIST_LIMIT })
      .then(setMarkers)
      .catch((cause: unknown) => setError(describe(cause)))
  }, [])

  // Background writes the id to session storage as well as relaying it, because a panel
  // that was closed at click time is still mounting and misses the relay. Whichever route
  // wins must clear the key, or the next mount re-focuses a stale marker.
  // The version is stamped here so a selection that arrives afterwards can take the
  // panel back (see resolveEditorState).
  const focus = useCallback((id: string, snapshot?: BwMarker) => {
    if (snapshot !== undefined) {
      setFocusedMarker(snapshot)
    }
    setFocusedId(id)
    setFocusedAtVersion(versionRef.current)
    void chrome.storage.session.remove(PENDING_FOCUS_KEY)
  }, [])

  useEffect(() => {
    const listener = (message: unknown): void => {
      if (isPanelFocus(message)) {
        focus(message.marker.id, message.marker)
      }
    }
    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [focus])

  useEffect(() => {
    chrome.storage.session
      .get(PENDING_FOCUS_KEY)
      .then((stored) => {
        const pending: unknown = stored[PENDING_FOCUS_KEY]
        if (isMarkerSnapshot(pending)) {
          focus(pending.id, pending)
        } else if (typeof pending === "string" && pending !== "") {
          // Compatibility with a pending id written before snapshots were introduced.
          focus(pending)
        }
      })
      .catch((cause: unknown) => setError(describe(cause)))
  }, [focus])

  useEffect(() => {
    if (focusedId === null) {
      setFocusedMarker(null)
      return
    }
    let alive = true
    fetchMarker(focusedId)
      .then((marker) => {
        if (!alive) {
          return
        }
        setFocusedMarker(marker)
        if (marker === null) {
          setError(t("markerNotFound"))
        }
      })
      .catch((cause: unknown) => {
        if (alive) {
          setError(describe(cause))
        }
      })
    return () => {
      alive = false
    }
  }, [focusedId])

  useEffect(() => {
    if (bookId !== null) {
      reloadList(bookId)
    }
  }, [bookId, reloadList])

  const select = useCallback(
    (id: string) => {
      setError(null)
      focus(
        id,
        markers.find((candidate) => candidate.id === id)
      )
    },
    [focus, markers]
  )

  const save = useCallback(
    async (draft: MarkerDraft) => {
      setBusy(true)
      updateSaveStatus("saving")
      setError(null)
      try {
        if (state.kind === "editing") {
          const updated = await upsertMarker({
            ...state.marker,
            memo: draft.memo,
            color: draft.color,
            updatedAt: Date.now()
          })
          setFocusedMarker(updated)
          reloadList(updated.bookId)
          await sendToViewerTab(viewerUpsertCommand(updated, bookContext))
          updateSaveStatus("saved")
          return
        }
        if (state.kind === "pending") {
          const created = await createMarker({
            selection: state.selection,
            memo: draft.memo,
            color: draft.color
          })
          // Keep the editor mounted while the pending selection is consumed. Waiting for
          // the focused-id fetch would briefly produce an empty state and tear down chat.
          setFocusedMarker(created)
          focus(created.id)
          reloadList(created.bookId)
          // background consumed the selection; this is what clears it here
          refreshSelection()
          await sendToViewerTab(viewerUpsertCommand(created, bookContext))
          updateSaveStatus("created")
        }
      } catch (cause: unknown) {
        updateSaveStatus("idle")
        setError(describe(cause))
      } finally {
        setBusy(false)
      }
    },
    [bookContext, focus, refreshSelection, reloadList, state, updateSaveStatus]
  )

  const dismiss = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      await clearPendingSelection()
      refreshSelection()
    } catch (cause: unknown) {
      setError(describe(cause))
    } finally {
      setBusy(false)
    }
  }, [refreshSelection])

  const remove = useCallback(async () => {
    if (state.kind !== "editing") {
      return
    }
    const { marker } = state
    setBusy(true)
    setError(null)
    try {
      // The viewer resolves the highlight through its cached marker list, so it has to be
      // told before the record disappears from the store. An unreachable viewer must not
      // block the deletion itself, so the outcome is only reported afterwards.
      const unpainted = await sendToViewerTab({
        type: "content/remove-highlight",
        markerId: marker.id
      })
      await deleteMarker(marker.id)
      setFocusedId(null)
      setFocusedMarker(null)
      setFocusedAtVersion(null)
      reloadList(marker.bookId)
      await sendToViewerTab({ type: "content/refresh-markers" })
      if (!unpainted) {
        setError(t("markerDeletedNeedsReload"))
      }
    } catch (cause: unknown) {
      setError(describe(cause))
    } finally {
      setBusy(false)
    }
  }, [reloadList, state])

  return {
    state,
    markers,
    bookContext,
    error: error ?? selectionError,
    busy,
    saveStatus,
    select,
    save,
    remove,
    dismiss
  }
}
