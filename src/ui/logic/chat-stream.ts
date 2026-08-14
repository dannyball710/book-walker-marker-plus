import type { ChatMessage } from "~/core/chat/types"
import type { ChatPortResponse } from "~/core/messaging/protocol"

export interface ChatStreamState {
  readonly messages: readonly ChatMessage[]
  /** assistant text accumulated so far; null when no reply is in flight */
  readonly draft: string | null
  readonly error: string | null
  readonly streaming: boolean
}

export type ChatStreamEvent =
  | { readonly type: "history"; readonly messages: readonly ChatMessage[] }
  | { readonly type: "send"; readonly message: ChatMessage }
  | { readonly type: "abort" }
  | ChatPortResponse

export const initialChatStreamState: ChatStreamState = {
  messages: [],
  draft: null,
  error: null,
  streaming: false
}

function withMessage(
  messages: readonly ChatMessage[],
  message: ChatMessage
): readonly ChatMessage[] {
  const index = messages.findIndex((m) => m.id === message.id)
  if (index === -1) {
    return [...messages, message]
  }
  return messages.map((m) => (m.id === message.id ? message : m))
}

export function chatStreamReducer(
  state: ChatStreamState,
  event: ChatStreamEvent
): ChatStreamState {
  switch (event.type) {
    case "history":
      return { messages: event.messages, draft: null, error: null, streaming: false }
    case "send":
      return {
        messages: withMessage(state.messages, event.message),
        draft: "",
        error: null,
        streaming: true
      }
    case "delta":
      return { ...state, draft: (state.draft ?? "") + event.delta, streaming: true }
    case "done":
      // Background persists the final message, so the draft is replaced rather than kept.
      return {
        messages: withMessage(state.messages, event.message),
        draft: null,
        error: null,
        streaming: false
      }
    case "error":
      return { ...state, draft: null, error: event.message, streaming: false }
    case "abort":
      return { ...state, draft: null, streaming: false }
  }
}
