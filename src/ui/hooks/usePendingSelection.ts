import { useCallback, useEffect, useRef, useState } from "react"

import type { BookContext, SelectionCaptured } from "~/core/marker/types"
import type { PanelSelectionMessage } from "~/core/messaging/protocol"
import { fetchPendingSelection } from "~/ui/messages"

export interface PendingSelectionResult {
  readonly selection: SelectionCaptured | null
  /** carries the book title, which SelectionCaptured itself does not hold */
  readonly context: BookContext | null
  /**
   * Counts selections that arrived while the panel was open, so a caller can tell
   * whether a selection is newer than something else it is holding.
   */
  readonly version: number
  readonly error: string | null
  readonly refresh: () => void
}

function isPanelSelection(message: unknown): message is PanelSelectionMessage {
  if (typeof message !== "object" || message === null) {
    return false
  }
  if (!("type" in message) || !("selection" in message)) {
    return false
  }
  return message.type === "panel/pending-selection" && message.selection !== null
}

/**
 * Background pushes each new /cri result, so the panel only queries once on mount — that
 * single call covers a selection that arrived while the panel was still mounting.
 */
export function usePendingSelection(): PendingSelectionResult {
  const [selection, setSelection] = useState<SelectionCaptured | null>(null)
  const [context, setContext] = useState<BookContext | null>(null)
  const [version, setVersion] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const aliveRef = useRef(true)
  // The first read reports what was already lying in background, which is older than
  // anything the panel is opening for — only later reads are arrivals.
  const readOnceRef = useRef(false)

  const refresh = useCallback(() => {
    fetchPendingSelection()
      .then((pending) => {
        if (!aliveRef.current) {
          return
        }
        setSelection(pending.selection)
        setContext(pending.context)
        if (pending.selection !== null && readOnceRef.current) {
          setVersion((current) => current + 1)
        }
        readOnceRef.current = true
        setError(null)
      })
      .catch((cause: unknown) => {
        if (aliveRef.current) {
          setError(cause instanceof Error ? cause.message : String(cause))
        }
      })
  }, [])

  useEffect(() => {
    aliveRef.current = true
    refresh()
    return () => {
      aliveRef.current = false
    }
  }, [refresh])

  useEffect(() => {
    const listener = (message: unknown): void => {
      if (isPanelSelection(message)) {
        setSelection(message.selection)
        setContext(message.context)
        setVersion((current) => current + 1)
        readOnceRef.current = true
        setError(null)
      }
    }
    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [])

  return { selection, context, version, error, refresh }
}
