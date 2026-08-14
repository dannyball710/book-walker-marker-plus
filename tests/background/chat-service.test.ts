import { beforeEach, describe, expect, it, vi } from "vitest"

import { runChatStream, type ChatTurn } from "~/background/chat-service"
import { ChatUserError } from "~/background/errors"
import type { ChatMessage, ChatSubject } from "~/core/chat/types"
import { t } from "~/core/i18n"
import type { BwMarker } from "~/core/marker/types"

interface Harness {
  chunks: string[]
  instructions: string
  sent: { role: string; content: unknown }[]
  /** whether the key was present in the streamText call at all, not just its value */
  providerOptionsSent: boolean
  providerOptions: unknown
  fail: Error | null
}

const h = vi.hoisted<Harness>(() => ({
  chunks: [],
  instructions: "",
  sent: [],
  providerOptionsSent: false,
  providerOptions: undefined,
  fail: null
}))

async function* emit(values: readonly string[]): AsyncGenerator<string> {
  for (const value of values) {
    if (h.fail !== null) {
      throw h.fail
    }
    yield value
  }
}

vi.mock("ai", () => ({
  streamText: (options: {
    readonly instructions: string
    readonly messages: readonly { readonly role: string; readonly content: unknown }[]
    readonly providerOptions?: unknown
  }) => {
    h.instructions = options.instructions
    h.sent = options.messages.map((message) => ({ ...message }))
    h.providerOptionsSent = "providerOptions" in options
    h.providerOptions = options.providerOptions
    return { textStream: emit(h.chunks) }
  }
}))

const MARKER: BwMarker = {
  id: "m1",
  bookId: "cid-1",
  bookTitle: "サンプル書籍",
  text: "これはテスト用の本文である。",
  memo: "「本文」の読みが気になる",
  color: "rgba(255,255,35,0.588235)",
  locator: {
    epubcfi: "epubcfi(/6/14!/4/2,/1:0,/1:12)",
    capturedProfile: "normal_default",
    byProfile: {}
  },
  progress: 12,
  createdAt: 1,
  updatedAt: 1
}

const MARKER_SUBJECT: ChatSubject = { kind: "marker", markerId: "m1" }

const DRAFT: ChatSubject = {
  kind: "draft",
  key: "epubcfi(/6/14!/4/2,/1:0,/1:12)",
  text: "壬氏は美しい男である。",
  memo: "壬氏って誰",
  bookTitle: "サンプル書籍"
}

let marker: BwMarker | null = MARKER
let permitted = true
let reasoning: Record<string, unknown> | undefined

vi.stubGlobal("chrome", {
  permissions: { contains: () => Promise.resolve(permitted) }
})

vi.mock("~/background/marker-service", () => ({
  getMarker: () => Promise.resolve(marker)
}))

vi.mock("~/storage/settings", () => ({
  getSettings: () => Promise.resolve({ storage: {}, llm: {}, prompts: [] })
}))

vi.mock("~/llm", () => ({
  resolveActiveLlm: () => ({
    descriptor: {
      id: "openai",
      label: "OpenAI",
      modelField: "model",
      hostsFor: () => ["https://api.openai.com/*"],
      fields: [
        { key: "apiKey", label: "API key", kind: "secret", required: true },
        { key: "model", label: "Model", kind: "text", required: true }
      ],
      createModel: () => "openai/gpt-4o-mini",
      providerOptionsFor: () => reasoning
    },
    values: { apiKey: "sk-test-abcdefghijkl", model: "gpt-4o-mini" }
  })
}))

function run(
  prompt: string,
  subject: ChatSubject = MARKER_SUBJECT,
  history: readonly ChatMessage[] = []
): Promise<ChatTurn> {
  return runChatStream({
    subject,
    prompt,
    history,
    signal: new AbortController().signal,
    handlers: { onDelta: () => undefined }
  })
}

beforeEach(() => {
  marker = MARKER
  permitted = true
  reasoning = undefined
  h.chunks = ["本文", "（ほんぶん）"]
  h.providerOptionsSent = false
  h.providerOptions = undefined
  h.fail = null
})

describe("runChatStream", () => {
  it("expands the prompt against the subject, so the turn matches what the model saw", async () => {
    const { user } = await run("この一文を訳して：{{text}}")

    expect(user.content).toBe(`この一文を訳して：${MARKER.text}`)
    expect(user.content).not.toContain("{{text}}")
    expect(h.sent[0]?.content).toBe(user.content)
  })

  it("continues the conversation it was handed rather than looking one up", async () => {
    const earlier: ChatMessage = {
      id: "earlier",
      role: "user",
      content: "だれ？",
      createdAt: 1
    }

    await run("なぜ？", MARKER_SUBJECT, [earlier])

    expect(h.sent.map((message) => message.content)).toEqual(["だれ？", "なぜ？"])
  })

  it("strips the credential out of a provider error before it can be logged", async () => {
    // the descriptor's own `kind: "secret"` field says what to redact, so any token
    // format is covered without this file knowing the provider's key prefix
    h.fail = new Error("Incorrect API key provided: sk-test-abcdefghijkl")

    await expect(run("なぜ？")).rejects.toThrow(/\*\*\*/)
    await expect(run("なぜ？")).rejects.not.toThrow(/sk-test-abcdefghijkl/)
  })

  it("hands back no turn at all when the stream fails midway", async () => {
    // an orphan question would be replayed as context on every later turn
    h.fail = new Error("network died")

    await expect(run("なぜ？")).rejects.toThrow(/network died/)
  })

  it("returns both turns, tagged with the model, for the caller to keep", async () => {
    const { user, assistant } = await run("なぜ？")

    expect(user.role).toBe("user")
    expect(assistant.role).toBe("assistant")
    expect(assistant.content).toBe("本文（ほんぶん）")
    expect(assistant.model).toBe("gpt-4o-mini")
  })

  it("gives the model the passage and the note as context", async () => {
    await run("なぜ？")
    expect(h.instructions).toContain(MARKER.text)
    expect(h.instructions).toContain(MARKER.memo)
  })

  it("refuses an empty reply instead of returning a bubble that is replayed forever", async () => {
    h.chunks = ["", "   "]

    await expect(run("なぜ？")).rejects.toBeInstanceOf(ChatUserError)
  })

  it("stops before asking anything when the provider's host was never granted", async () => {
    permitted = false

    await expect(run("なぜ？")).rejects.toBeInstanceOf(ChatUserError)
    await expect(run("なぜ？")).rejects.toThrow(
      t("errorHostPermissionMissing", {
        label: "OpenAI",
        origins: "https://api.openai.com/*"
      })
    )
  })

  it("reports a deleted marker as a user-facing error", async () => {
    marker = null

    await expect(run("なぜ？")).rejects.toBeInstanceOf(ChatUserError)
  })
})

describe("runChatStream — provider options", () => {
  it("forwards what the provider asked for, so reasoning effort actually reaches the request", async () => {
    reasoning = { openai: { reasoningEffort: "high" } }

    await run("なぜ？")

    expect(h.providerOptions).toEqual({ openai: { reasoningEffort: "high" } })
  })

  it("sends no providerOptions key at all when the provider has none", async () => {
    // `{}` is not the same as absent for a provider that validates the object, so the
    // key has to be missing rather than set to undefined.
    await run("なぜ？")

    expect(h.providerOptionsSent).toBe(false)
  })
})

describe("runChatStream — a draft subject", () => {
  it("answers about the selection it was handed, not about a marker", async () => {
    // A deleted or absent marker must not affect it: the draft carries its own passage.
    marker = null

    const { user } = await run("この一文を訳して：{{text}}", DRAFT)

    expect(user.content).toBe(`この一文を訳して：${DRAFT.text}`)
    expect(h.instructions).toContain(DRAFT.text)
    expect(h.instructions).toContain(DRAFT.memo)
  })

  it("continues the conversation it is given, so a draft has a memory too", async () => {
    const earlier: ChatMessage = {
      id: "earlier",
      role: "user",
      content: "だれ？",
      createdAt: 1
    }

    await run("なぜ？", DRAFT, [earlier])

    expect(h.sent.map((message) => message.content)).toEqual(["だれ？", "なぜ？"])
  })
})
