import { describe, expect, it, vi } from "vitest"

import type { ChatTurn } from "~/background/chat-service"
import {
  createChatPortSession,
  toReadableError,
  type ChatPortDeps
} from "~/background/chat-port"
import { ChatUserError } from "~/background/errors"
import { t } from "~/core/i18n"
import type { ChatPortResponse } from "~/core/messaging/protocol"
import { ProviderConfigError } from "~/core/provider/descriptor"

type RunInput = Parameters<ChatPortDeps["run"]>[0]

interface PendingRun {
  readonly input: RunInput
  readonly resolve: (turn: ChatTurn) => void
  readonly reject: (error: unknown) => void
}

function reply(content: string): ChatTurn {
  return {
    user: { id: `user-${content}`, role: "user", content: "なぜ？", createdAt: 1 },
    assistant: { id: `assistant-${content}`, role: "assistant", content, createdAt: 2 }
  }
}

function setup(post: (response: ChatPortResponse) => void = () => undefined) {
  const runs: PendingRun[] = []
  const session = createChatPortSession({
    post,
    run: (input) =>
      new Promise<ChatTurn>((resolve, reject) => {
        runs.push({ input, resolve, reject })
      })
  })
  return { session, runs }
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

const start = {
  type: "start",
  subject: { kind: "marker", markerId: "m1" },
  prompt: "なぜ？"
} as const

const draftStart = {
  type: "start",
  subject: {
    kind: "draft",
    key: "cfi-1",
    text: "壬氏は美しい男である。",
    memo: "",
    bookTitle: "サンプル書籍"
  },
  prompt: "だれ？"
} as const

describe("createChatPortSession — one stream per port", () => {
  it("forwards the deltas of the current stream", () => {
    const post = vi.fn()
    const { session, runs } = setup(post)

    session.onMessage(start)
    runs[0]?.input.handlers.onDelta("A")

    expect(post).toHaveBeenCalledWith({ type: "delta", delta: "A" })
  })

  it("silences the superseded stream, so two answers cannot interleave", async () => {
    const post = vi.fn()
    const { session, runs } = setup(post)

    session.onMessage(start)
    session.onMessage({ ...start, prompt: "second" })
    post.mockClear()

    // the first stream is still draining its pipeline
    runs[0]?.input.handlers.onDelta("stale")
    runs[0]?.resolve(reply("stale answer"))
    await flush()

    expect(post).not.toHaveBeenCalled()

    runs[1]?.input.handlers.onDelta("fresh")
    expect(post).toHaveBeenCalledWith({ type: "delta", delta: "fresh" })
  })

  it("aborts the superseded stream rather than leaving it running", () => {
    const { session, runs } = setup()

    session.onMessage(start)
    session.onMessage({ ...start, prompt: "second" })

    expect(runs[0]?.input.signal.aborted).toBe(true)
    expect(runs[1]?.input.signal.aborted).toBe(false)
  })

  it("says nothing more after an abort request", async () => {
    const post = vi.fn()
    const { session, runs } = setup(post)

    session.onMessage(start)
    session.onMessage({ type: "abort" })
    post.mockClear()

    expect(runs[0]?.input.signal.aborted).toBe(true)
    runs[0]?.input.handlers.onDelta("stale")
    runs[0]?.resolve(reply("late answer"))
    await flush()

    expect(post).not.toHaveBeenCalled()
  })

  it("aborts an in-flight reply when the conversation is cleared", async () => {
    const post = vi.fn()
    const { session, runs } = setup(post)

    session.onMessage(start)
    session.onMessage({ type: "clear" })
    post.mockClear()

    expect(runs[0]?.input.signal.aborted).toBe(true)
    runs[0]?.input.handlers.onDelta("stale")
    runs[0]?.resolve(reply("late answer"))
    await flush()

    expect(post).not.toHaveBeenCalled()
  })

  it("reports nothing at all once the port is gone", async () => {
    const post = vi.fn()
    const { session, runs } = setup(post)

    session.onMessage(start)
    session.onDisconnect()
    post.mockClear()

    runs[0]?.input.handlers.onDelta("stale")
    runs[0]?.reject(new ChatUserError("boom"))
    await flush()

    expect(runs[0]?.input.signal.aborted).toBe(true)
    expect(post).not.toHaveBeenCalled()
  })

  it("stops writing when the port throws before its disconnect event arrives", async () => {
    const post = vi.fn(() => {
      throw new Error("Attempting to use a disconnected port object")
    })
    const { session, runs } = setup(post)

    session.onMessage(start)
    expect(() => runs[0]?.input.handlers.onDelta("A")).not.toThrow()
    expect(post).toHaveBeenCalledTimes(1)

    runs[0]?.input.handlers.onDelta("B")
    runs[0]?.resolve(reply("done"))
    await flush()

    expect(post).toHaveBeenCalledTimes(1)
  })

  it("completes the current stream with the persisted message", async () => {
    const post = vi.fn()
    const { session, runs } = setup(post)
    const turn = reply("答え")

    session.onMessage(start)
    runs[0]?.resolve(turn)
    await flush()

    expect(post).toHaveBeenCalledWith({ type: "done", message: turn.assistant })
  })

  it("rejects a request that is not a chat command", () => {
    const post = vi.fn()
    const { session, runs } = setup(post)

    session.onMessage({ type: "start", subject: { kind: "marker", markerId: 1 } })

    expect(runs).toHaveLength(0)
    expect(post).toHaveBeenCalledWith({
      type: "error",
      message: t("errorChatRequestMalformed")
    })
  })
})

describe("createChatPortSession — the conversation", () => {
  it("keeps it in the port, because nothing anywhere persists it", async () => {
    const { session, runs } = setup()
    const first = reply("答え")

    session.onMessage(draftStart)
    expect(runs[0]?.input.history).toEqual([])
    runs[0]?.resolve(first)
    await flush()

    session.onMessage({ ...draftStart, prompt: "なぜ？" })

    expect(runs[1]?.input.history).toEqual([first.user, first.assistant])
  })

  it("keeps draft history when that passage becomes a saved marker", async () => {
    const { session, runs } = setup()
    const first = reply("答え")

    session.onMessage(draftStart)
    runs[0]?.resolve(first)
    await flush()

    session.onMessage({
      ...start,
      subject: { kind: "marker", markerId: "m1", key: "cfi-1" }
    })

    expect(runs[1]?.input.history).toEqual([first.user, first.assistant])
  })

  it("carries a marker conversation the same way, with nothing loaded from storage", async () => {
    const { session, runs } = setup()
    const first = reply("答え")

    session.onMessage(start)
    expect(runs[0]?.input.history).toEqual([])
    runs[0]?.resolve(first)
    await flush()

    session.onMessage({ ...start, prompt: "ほかには？" })

    expect(runs[1]?.input.history).toEqual([first.user, first.assistant])
  })

  it("starts a fresh history after the conversation is cleared", async () => {
    const { session, runs } = setup()
    const first = reply("答え")

    session.onMessage(start)
    runs[0]?.resolve(first)
    await flush()

    session.onMessage({ type: "clear" })
    session.onMessage({ ...start, prompt: "新しい質問" })

    expect(runs[1]?.input.history).toEqual([])
  })

  it("starts over when the reader selects another passage", async () => {
    const { session, runs } = setup()

    session.onMessage(draftStart)
    runs[0]?.resolve(reply("答え"))
    await flush()

    session.onMessage({
      ...draftStart,
      subject: { ...draftStart.subject, key: "cfi-2" }
    })

    expect(runs[1]?.input.history).toEqual([])
  })

  it("starts over when the reader moves to another marker", async () => {
    const { session, runs } = setup()

    session.onMessage(start)
    runs[0]?.resolve(reply("答え"))
    await flush()

    session.onMessage({ ...start, subject: { kind: "marker", markerId: "m2" } })

    expect(runs[1]?.input.history).toEqual([])
  })

  it("does not feed a superseded answer back as context", async () => {
    // It never reached the panel, so replaying it would make the transcript disagree
    // with what the reader is looking at.
    const { session, runs } = setup()

    session.onMessage(draftStart)
    session.onMessage({ ...draftStart, prompt: "なぜ？" })
    runs[0]?.resolve(reply("stale"))
    const second = reply("答え")
    runs[1]?.resolve(second)
    await flush()

    session.onMessage({ ...draftStart, prompt: "ほかには？" })

    expect(runs[2]?.input.history).toEqual([second.user, second.assistant])
  })

  it("never hands a marker conversation the draft transcript", async () => {
    const { session, runs } = setup()

    session.onMessage(draftStart)
    runs[0]?.resolve(reply("答え"))
    await flush()

    session.onMessage(start)

    expect(runs[1]?.input.history).toEqual([])
  })
})

describe("toReadableError", () => {
  it("shows errors written for the user", () => {
    expect(toReadableError(new ChatUserError("This marker no longer exists."))).toBe(
      "This marker no longer exists."
    )
    expect(
      toReadableError(new ProviderConfigError("OpenAI", [{ field: "apiKey", message: "required" }]))
    ).toContain("apiKey")
  })

  it("never lets a provider error reach the panel, because it can quote the key", () => {
    const message = toReadableError(
      new Error("Incorrect API key provided: sk-proj-AbCdEfGhIjKlMnOp")
    )
    expect(message).not.toContain("sk-proj-AbCdEfGhIjKlMnOp")
    expect(message).toBe(t("errorModelRequestFailed"))
  })

  it("masks a key that reached a user-facing message anyway", () => {
    const masked = toReadableError(new ChatUserError("key sk-or-v1-AbCdEfGhIjKl rejected"))
    expect(masked).not.toContain("sk-or-v1-AbCdEfGhIjKl")
    expect(masked).toContain("***")
  })

  it("falls back to fixed wording for a thrown non-error", () => {
    expect(toReadableError("boom")).toBe(t("errorModelRequestFailed"))
  })

  it("masks by known key prefixes only — a provider with another token format is not covered", () => {
    // Documents a real limitation rather than asserting safety: the allowlist above is what
    // keeps provider errors out, and this pattern is only the second line of defence.
    const unusual = toReadableError(new ChatUserError("token deadbeefdeadbeefdeadbeef rejected"))
    expect(unusual).toContain("deadbeefdeadbeefdeadbeef")
  })
})
