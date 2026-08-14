import { describe, expect, it } from "vitest"

import type { ChatMessage } from "~/core/chat/types"
import {
  chatStreamReducer,
  initialChatStreamState,
  type ChatStreamEvent,
  type ChatStreamState
} from "~/ui/logic/chat-stream"

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "a-1",
    role: "assistant",
    content: "reply",
    createdAt: 10,
    ...overrides
  }
}

function run(events: readonly ChatStreamEvent[]): ChatStreamState {
  return events.reduce(chatStreamReducer, initialChatStreamState)
}

describe("chatStreamReducer", () => {
  it("shows the question immediately and marks the stream as running", () => {
    const user = message({ id: "u-1", role: "user", content: "question" })
    const state = run([{ type: "send", message: user }])
    expect(state.messages).toEqual([user])
    expect(state.streaming).toBe(true)
    expect(state.draft).toBe("")
  })

  it("accumulates deltas in order", () => {
    const state = run([
      { type: "send", message: message({ id: "u-1", role: "user" }) },
      { type: "delta", delta: "こん" },
      { type: "delta", delta: "にちは" }
    ])
    expect(state.draft).toBe("こんにちは")
  })

  it("replaces the draft with the persisted message on done", () => {
    const final = message({ content: "こんにちは" })
    const state = run([
      { type: "send", message: message({ id: "u-1", role: "user" }) },
      { type: "delta", delta: "こん" },
      { type: "done", message: final }
    ])
    expect(state.draft).toBeNull()
    expect(state.streaming).toBe(false)
    expect(state.messages.at(-1)).toEqual(final)
  })

  it("does not duplicate a message that arrives twice", () => {
    const final = message()
    const state = run([
      { type: "done", message: final },
      { type: "done", message: { ...final, content: "corrected" } }
    ])
    expect(state.messages).toHaveLength(1)
    expect(state.messages[0]?.content).toBe("corrected")
  })

  it("surfaces the error and stops the stream instead of leaving a half reply", () => {
    const state = run([
      { type: "send", message: message({ id: "u-1", role: "user" }) },
      { type: "delta", delta: "partial" },
      { type: "error", message: "invalid API key" }
    ])
    expect(state.error).toBe("invalid API key")
    expect(state.draft).toBeNull()
    expect(state.streaming).toBe(false)
  })

  it("clears the in-flight reply when the user aborts", () => {
    const state = run([
      { type: "send", message: message({ id: "u-1", role: "user" }) },
      { type: "delta", delta: "partial" },
      { type: "abort" }
    ])
    expect(state.streaming).toBe(false)
    expect(state.draft).toBeNull()
    expect(state.messages).toHaveLength(1)
  })

  it("resets everything when history for another marker is loaded", () => {
    const state = run([
      { type: "send", message: message({ id: "u-1", role: "user" }) },
      { type: "delta", delta: "partial" },
      { type: "history", messages: [message({ id: "b-1" })] }
    ])
    expect(state).toEqual({
      messages: [message({ id: "b-1" })],
      draft: null,
      error: null,
      streaming: false
    })
  })
})
