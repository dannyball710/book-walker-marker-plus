import { useCallback, useEffect, useReducer, useRef } from "react"

import {
  chatSubjectKey,
  type ChatMessage,
  type ChatSubject
} from "~/core/chat/types"
import { t } from "~/core/i18n"
import {
  CHAT_PORT_NAME,
  type ChatPortRequest,
  type ChatPortResponse
} from "~/core/messaging/protocol"
import {
  chatStreamReducer,
  initialChatStreamState,
  type ChatStreamState
} from "~/ui/logic/chat-stream"

export interface ChatStreamController {
  readonly state: ChatStreamState
  /**
   * `prompt` goes over the port verbatim — background owns placeholder expansion because
   * it holds the authoritative subject. `display` is what the message list shows.
   */
  readonly send: (prompt: string, display?: string) => void
  readonly abort: () => void
  readonly clear: () => void
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (typeof value !== "object" || value === null) {
    return false
  }
  if (!("id" in value) || !("content" in value) || !("role" in value)) {
    return false
  }
  return typeof value.id === "string" && typeof value.content === "string"
}

function isChatPortResponse(value: unknown): value is ChatPortResponse {
  if (typeof value !== "object" || value === null || !("type" in value)) {
    return false
  }
  if (value.type === "delta") {
    return "delta" in value && typeof value.delta === "string"
  }
  if (value.type === "error") {
    return "message" in value && typeof value.message === "string"
  }
  if (value.type === "done") {
    return "message" in value && isChatMessage(value.message)
  }
  return false
}

export function useChatStream(subject: ChatSubject | null): ChatStreamController {
  const [state, dispatch] = useReducer(chatStreamReducer, initialChatStreamState)
  const portRef = useRef<chrome.runtime.Port | null>(null)
  // the subject changes identity on every render, so the live value is read from here
  const subjectRef = useRef(subject)
  subjectRef.current = subject
  const key = subject === null ? null : chatSubjectKey(subject)
  // Callbacks below outlive the render that created them; this is the live value.
  const streamingRef = useRef(false)
  streamingRef.current = state.streaming

  const connect = useCallback((): chrome.runtime.Port => {
    const existing = portRef.current
    if (existing !== null) {
      return existing
    }
    const port = chrome.runtime.connect({ name: CHAT_PORT_NAME })
    port.onMessage.addListener((message: unknown) => {
      if (isChatPortResponse(message)) {
        dispatch(message)
      }
    })
    port.onDisconnect.addListener(() => {
      portRef.current = null
      // A reply in flight dies with the port, and background sends nothing more, so
      // without this the UI would sit on a half message forever.
      if (streamingRef.current) {
        dispatch({
          type: "error",
          message: t("chatPortDisconnected")
        })
      }
    })
    portRef.current = port
    return port
  }, [])

  // MV3 recycles idle ports, so the port is reopened lazily on the next send.
  useEffect(() => {
    connect()
    return () => {
      portRef.current?.disconnect()
      portRef.current = null
    }
  }, [connect])

  // A conversation is never stored, so there is nothing to load: it only ever exists
  // in this transcript and in the port, and both start empty on a new subject.
  useEffect(() => {
    dispatch({ type: "history", messages: [] })
  }, [key])

  const send = useCallback(
    (prompt: string, display?: string) => {
      const trimmed = prompt.trim()
      const current = subjectRef.current
      // The hook owns the one-stream-at-a-time invariant rather than trusting callers.
      if (trimmed === "" || current === null || streamingRef.current) {
        return
      }
      dispatch({
        type: "send",
        message: {
          id: crypto.randomUUID(),
          role: "user",
          content: display ?? trimmed,
          createdAt: Date.now()
        }
      })
      const request: ChatPortRequest = {
        type: "start",
        subject: current,
        prompt: trimmed
      }
      connect().postMessage(request)
    },
    [connect]
  )

  const abort = useCallback(() => {
    const request: ChatPortRequest = { type: "abort" }
    portRef.current?.postMessage(request)
    dispatch({ type: "abort" })
  }, [])

  const clear = useCallback(() => {
    const request: ChatPortRequest = { type: "clear" }
    portRef.current?.postMessage(request)
    dispatch({ type: "history", messages: [] })
  }, [])

  return { state, send, abort, clear }
}
