/**
 * The chat port's concurrency state machine: one stream per port, a second
 * `start` supersedes the first, and neither an aborted nor a superseded stream
 * may put another byte on the wire. Kept free of `chrome` APIs so it is testable.
 */
import * as z from "zod"

import { ChatUserError } from "~/background/errors"
import type { ChatStreamHandlers, ChatTurn } from "~/background/chat-service"
import { chatSubjectKey, type ChatMessage, type ChatSubject } from "~/core/chat/types"
import { t } from "~/core/i18n"
import type { ChatPortRequest, ChatPortResponse } from "~/core/messaging/protocol"
import {
  maskSecrets,
  ProviderConfigError,
  UnknownProviderError
} from "~/core/provider/descriptor"

export interface ChatPortDeps {
  readonly post: (response: ChatPortResponse) => void
  readonly run: (input: {
    readonly subject: ChatSubject
    readonly prompt: string
    readonly history: readonly ChatMessage[]
    readonly signal: AbortSignal
    readonly handlers: ChatStreamHandlers
  }) => Promise<ChatTurn>
}

export interface ChatPortSession {
  readonly onMessage: (raw: unknown) => void
  readonly onDisconnect: () => void
}

const chatSubjectSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("marker"),
    markerId: z.string(),
    key: z.string().optional()
  }),
  z.object({
    kind: z.literal("draft"),
    key: z.string(),
    text: z.string(),
    memo: z.string(),
    bookTitle: z.string(),
    contextText: z.string().optional()
  })
])

const chatPortRequestSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("start"),
    subject: chatSubjectSchema,
    prompt: z.string()
  }),
  z.object({ type: z.literal("abort") }),
  z.object({ type: z.literal("clear") })
])

export function parseChatPortRequest(value: unknown): ChatPortRequest | null {
  const parsed = chatPortRequestSchema.safeParse(value)
  if (!parsed.success) {
    return null
  }
  const request = parsed.data
  if (request.type !== "start") {
    return request
  }
  const subject: ChatSubject =
    request.subject.kind === "draft"
      ? {
          kind: "draft",
          key: request.subject.key,
          text: request.subject.text,
          memo: request.subject.memo,
          bookTitle: request.subject.bookTitle,
          ...(request.subject.contextText === undefined
            ? {}
            : { contextText: request.subject.contextText })
        }
      : {
          kind: "marker",
          markerId: request.subject.markerId,
          ...(request.subject.key === undefined
            ? {}
            : { key: request.subject.key })
        }
  return { type: "start", subject, prompt: request.prompt }
}

const GENERIC_FAILURE = t("errorModelRequestFailed")

/**
 * Provider messages can quote the credential that was rejected, so only errors written
 * for the user pass through. `maskSecrets` is a second line of defence on top of that,
 * shared with `ProviderConfigError` so there is one pattern to keep current — note it
 * recognises known key prefixes, so a provider with an unusual token format is masked
 * only by the allowlist above, not by the pattern.
 */
export function toReadableError(error: unknown): string {
  if (
    error instanceof ChatUserError ||
    error instanceof ProviderConfigError ||
    error instanceof UnknownProviderError
  ) {
    return maskSecrets(error.message)
  }
  return GENERIC_FAILURE
}

export function createChatPortSession(deps: ChatPortDeps): ChatPortSession {
  let inFlight: AbortController | null = null
  let closed = false
  // The conversation is deliberately never stored, so this port is the only thing
  // holding it: it lasts as long as the panel is open and as long as the reader stays
  // on the same subject.
  let subjectKey: string | null = null
  let history: readonly ChatMessage[] = []

  const post = (response: ChatPortResponse): void => {
    if (closed) return
    try {
      deps.post(response)
    } catch {
      // the port was torn down before its disconnect event reached us; stop writing
      closed = true
    }
  }

  const start = async (subject: ChatSubject, prompt: string): Promise<void> => {
    inFlight?.abort()
    const controller = new AbortController()
    inFlight = controller
    // a superseded or aborted stream keeps producing for a while; it must stay silent
    const isCurrent = (): boolean => inFlight === controller && !controller.signal.aborted

    const key = chatSubjectKey(subject)
    if (key !== subjectKey) {
      subjectKey = key
      history = []
    }
    const asked = history

    try {
      const turn = await deps.run({
        subject,
        prompt,
        history: asked,
        signal: controller.signal,
        handlers: {
          onDelta: (delta) => {
            if (isCurrent()) post({ type: "delta", delta })
          }
        }
      })
      if (isCurrent()) {
        // a superseded answer never reached the panel, so it must not become context
        if (key === subjectKey) {
          history = [...asked, turn.user, turn.assistant]
        }
        post({ type: "done", message: turn.assistant })
      }
    } catch (error) {
      // the readable version drops the detail, so keep the original where it can be found
      if (!(error instanceof ChatUserError)) {
        console.error("[bwm] chat stream failed", error)
      }
      if (isCurrent()) post({ type: "error", message: toReadableError(error) })
    } finally {
      if (inFlight === controller) inFlight = null
    }
  }

  return {
    onMessage(raw) {
      const request = parseChatPortRequest(raw)
      if (request === null) {
        post({ type: "error", message: t("errorChatRequestMalformed") })
        return
      }
      if (request.type === "abort") {
        inFlight?.abort()
        inFlight = null
        return
      }
      if (request.type === "clear") {
        inFlight?.abort()
        inFlight = null
        history = []
        return
      }
      void start(request.subject, request.prompt)
    },

    onDisconnect() {
      closed = true
      inFlight?.abort()
      inFlight = null
    }
  }
}
