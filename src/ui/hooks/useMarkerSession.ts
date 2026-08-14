import { useCallback, useEffect, useRef, useState } from "react"

import { PENDING_FOCUS_KEY } from "~/background/message-types"
import { t } from "~/core/i18n"
import type { BookContext, BwMarker, MarkerColor } from "~/core/marker/types"
import type { PanelFocusMessage } from "~/core/messaging/protocol"
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

export interface MarkerSession {
  readonly state: EditorState
  readonly markers: readonly BwMarker[]
  /** book of the pending selection, the only source of its title */
  readonly bookContext: BookContext | null
  readonly error: string | null
  readonly busy: boolean
  readonly select: (id: string) => void
  readonly save: (draft: MarkerDraft) => Promise<void>
  readonly remove: () => Promise<void>
  /** throw away a selection the user decided not to turn into a marker */
  readonly dismiss: () => Promise<void>
}

function isPanelFocus(message: unknown): message is PanelFocusMessage {
  if (typeof message !== "object" || message === null) {
    return false
  }
  if (!("type" in message) || !("markerId" in message)) {
    return false
  }
  return message.type === "panel/focus-marker" && typeof message.markerId === "string"
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

export function useMarkerSession(): MarkerSession {
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [focusedMarker, setFocusedMarker] = useState<BwMarker | null>(null)
  const [focusedAtVersion, setFocusedAtVersion] = useState<number | null>(null)
  const [markers, setMarkers] = useState<readonly BwMarker[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
  const focus = useCallback((id: string) => {
    setFocusedId(id)
    setFocusedAtVersion(versionRef.current)
    void chrome.storage.session.remove(PENDING_FOCUS_KEY)
  }, [])

  useEffect(() => {
    const listener = (message: unknown): void => {
      if (isPanelFocus(message)) {
        focus(message.markerId)
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
        if (typeof pending === "string" && pending !== "") {
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
      focus(id)
    },
    [focus]
  )

  const save = useCallback(
    async (draft: MarkerDraft) => {
      setBusy(true)
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
          await sendToViewerTab({ type: "content/refresh-markers" })
          return
        }
        if (state.kind === "pending") {
          const created = await createMarker({
            selection: state.selection,
            memo: draft.memo,
            color: draft.color
          })
          focus(created.id)
          reloadList(created.bookId)
          // background consumed the selection; this is what clears it here
          refreshSelection()
          await sendToViewerTab({ type: "content/refresh-markers" })
        }
      } catch (cause: unknown) {
        setError(describe(cause))
      } finally {
        setBusy(false)
      }
    },
    [focus, refreshSelection, reloadList, state]
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
    select,
    save,
    remove,
    dismiss
  }
}
