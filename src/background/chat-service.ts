/**
 * Chat orchestration: resolves what the conversation is about and runs the model.
 * The conversation itself is never stored — the caller holds it for as long as it
 * lives; the `llm` layer below only knows how to build a model.
 */
import { streamText, type ModelMessage } from "ai"

import { ChatUserError } from "~/background/errors"
import { getMarker } from "~/background/marker-service"
import { ensureHostPermission } from "~/background/permissions"
import type { ChatMessage, ChatSubject } from "~/core/chat/types"
import { t } from "~/core/i18n"
import { expandPrompt, type PromptVars } from "~/core/prompt/expand"
import type { ConfigValues } from "~/core/provider/descriptor"
import { resolveActiveLlm } from "~/llm"
import type { LlmProviderDescriptor } from "~/llm/provider"
import { buildSystemPrompt } from "~/llm/system-prompt"
import { getSettings } from "~/storage/settings"

export interface ChatStreamHandlers {
  readonly onDelta: (delta: string) => void
}

export interface ChatStreamInput {
  readonly subject: ChatSubject
  readonly prompt: string
  /** the conversation so far; nothing here is read from or written to storage */
  readonly history: readonly ChatMessage[]
  readonly signal: AbortSignal
  readonly handlers: ChatStreamHandlers
}

/** Both turns, because the caller is the only thing keeping the conversation. */
export interface ChatTurn {
  readonly user: ChatMessage
  readonly assistant: ChatMessage
}

/**
 * Redacts by the credential's literal value rather than by a guessed key prefix, so a
 * provider with any token format is covered without contributing a pattern. The
 * descriptor already says which fields are secret.
 */
function redactSecrets(
  text: string,
  descriptor: LlmProviderDescriptor,
  values: ConfigValues
): string {
  return descriptor.fields
    .filter((field) => field.kind === "secret")
    .map((field) => values[field.key] ?? "")
    // short values would turn ordinary words into ***
    .filter((secret) => secret.length >= 8)
    .reduce((masked, secret) => masked.split(secret).join("***"), text)
}

function toModelMessage(message: ChatMessage): ModelMessage {
  if (message.role === "user") {
    return { role: "user", content: message.content }
  }
  return { role: "assistant", content: message.content }
}

/**
 * A draft carries the passage with it: there is no stored record to read it back from,
 * and it must stay the passage the reader selected even after they select another one.
 */
type PassageContext = Omit<PromptVars, "responseLanguage">

async function loadContext(subject: ChatSubject): Promise<PassageContext> {
  if (subject.kind === "draft") {
    return {
      text: subject.text,
      memo: subject.memo,
      bookTitle: subject.bookTitle,
      ...(subject.contextText === undefined
        ? {}
        : { contextText: subject.contextText })
    }
  }
  const marker = await getMarker(subject.markerId)
  if (!marker) {
    throw new ChatUserError(t("errorMarkerGone"))
  }
  return {
    text: marker.text,
    memo: marker.memo,
    bookTitle: marker.bookTitle,
    ...(marker.contextText === undefined
      ? {}
      : { contextText: marker.contextText })
  }
}

export async function runChatStream(input: ChatStreamInput): Promise<ChatTurn> {
  const context = await loadContext(input.subject)
  const settings = await getSettings()
  const { descriptor, values } = resolveActiveLlm(settings)
  // checked before the question is asked, so a missing grant costs nothing
  await ensureHostPermission({
    label: descriptor.label,
    origins: descriptor.hostsFor(values)
  })

  const userMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: "user",
    // the expanded text is what the model sees, so it is also what history must keep
    content: expandPrompt(input.prompt, {
      ...context,
      responseLanguage: settings.responseLanguage
    }),
    createdAt: Date.now()
  }

  // absent rather than empty: a provider that validates the object rejects `{}`
  const providerOptions = descriptor.providerOptionsFor(values)
  const result = streamText({
    model: descriptor.createModel(values),
    instructions: buildSystemPrompt({
      bookTitle: context.bookTitle,
      text: context.text,
      memo: context.memo,
      responseLanguage: settings.responseLanguage,
      ...(context.contextText === undefined
        ? {}
        : { contextText: context.contextText })
    }),
    messages: [...input.history, userMessage].map(toModelMessage),
    abortSignal: input.signal,
    ...(providerOptions === undefined ? {} : { providerOptions })
  })

  let content = ""
  try {
    for await (const delta of result.textStream) {
      content += delta
      input.handlers.onDelta(delta)
    }
  } catch (error) {
    // The provider's own message can quote the key it rejected, and it is about to be
    // logged by the port. Strip the credential before it leaves this scope.
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(redactSecrets(reason, descriptor, values))
  }

  // an empty reply kept here would be replayed as context on every later turn
  if (content.trim() === "") {
    throw new ChatUserError(t("errorModelEmptyReply"))
  }

  const modelId = values[descriptor.modelField]
  const assistantMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: "assistant",
    content,
    createdAt: Date.now(),
    // absent rather than "", so an unknown model does not read as a model named ""
    ...(modelId === undefined || modelId === "" ? {} : { model: modelId })
  }

  // Both turns are handed back only once the answer exists: an unanswered question
  // would just sit in the caller's history and be replayed as context every later turn.
  return { user: userMessage, assistant: assistantMessage }
}
