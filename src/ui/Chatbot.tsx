import { useEffect, useRef, useState } from "react"

import { chatSubjectKey, type ChatSubject } from "~/core/chat/types"
import { t } from "~/core/i18n"
import { markdownToPlainText } from "~/core/markdown/plain"
import { MarkdownText } from "~/core/markdown/render"
import { expandPrompt, type PromptVars } from "~/core/prompt/expand"
import { RubyText } from "~/core/ruby/render"
import type { PromptPreset } from "~/core/settings/types"
import { Icon } from "~/ui/Icon"
import { useChatStream } from "~/ui/hooks/useChatStream"
import { selectedTextWithRuby } from "~/ui/logic/ruby-copy"
import { fetchSettings } from "~/ui/messages"
import {
  buttonDanger,
  buttonPrimary,
  buttonQuiet,
  cx,
  errorBox
} from "~/ui/styles"

export interface ChatbotProps {
  /** a marker or an unsaved selection; null when nothing is loaded */
  readonly subject: ChatSubject | null
  readonly context: PromptVars
  readonly prompts: readonly PromptPreset[]
  readonly onUseReply: (reply: string) => void
}

export function Chatbot(props: ChatbotProps) {
  const { state, send, abort, clear } = useChatStream(props.subject)
  const [input, setInput] = useState("")
  const [currentPrompts, setCurrentPrompts] = useState(props.prompts)
  const [loadingPresetId, setLoadingPresetId] = useState<string | null>(null)
  const [promptError, setPromptError] = useState<string | null>(null)
  const [usedReplyIds, setUsedReplyIds] = useState<ReadonlySet<string>>(
    () => new Set()
  )
  const [expandedUserIds, setExpandedUserIds] = useState<ReadonlySet<string>>(
    () => new Set()
  )
  const chatRef = useRef<HTMLElement | null>(null)
  const logRef = useRef<HTMLDivElement | null>(null)
  const disabled = props.subject === null || state.streaming
  const hasTranscript = state.messages.length > 0 || state.draft !== null
  const subjectKey =
    props.subject === null ? null : chatSubjectKey(props.subject)

  useEffect(() => {
    setCurrentPrompts(props.prompts)
  }, [props.prompts])

  useEffect(() => {
    setUsedReplyIds(new Set())
    setExpandedUserIds(new Set())
    setPromptError(null)
  }, [subjectKey])

  useEffect(() => {
    const log = logRef.current
    if (log !== null) {
      log.scrollTop = log.scrollHeight
    }
  }, [state.messages, state.draft])

  useEffect(() => {
    const chat = chatRef.current
    if (chat === null) {
      return
    }
    const document = chat.ownerDocument
    const preserveRuby = (event: ClipboardEvent): void => {
      const clipboard = event.clipboardData
      if (clipboard === null) {
        return
      }
      const text = selectedTextWithRuby(chat, document.getSelection())
      if (text === null) {
        return
      }
      event.preventDefault()
      clipboard.setData("text/plain", text)
    }
    document.addEventListener("copy", preserveRuby, true)
    return () => document.removeEventListener("copy", preserveRuby, true)
  }, [])

  const submit = (prompt: string, display?: string) => {
    send(prompt, display)
    setInput("")
  }

  const submitPreset = async (presetId: string): Promise<void> => {
    setLoadingPresetId(presetId)
    setPromptError(null)
    try {
      const settings = await fetchSettings()
      setCurrentPrompts(settings.prompts)
      const preset = settings.prompts.find((candidate) => candidate.id === presetId)
      if (preset === undefined) {
        return
      }
      submit(
        preset.template,
        expandPrompt(preset.template, {
          ...props.context,
          responseLanguage: settings.responseLanguage
        })
      )
    } catch (cause: unknown) {
      setPromptError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoadingPresetId(null)
    }
  }

  return (
    <section
      ref={chatRef}
      className="flex h-full min-h-0 flex-col gap-2 border-t border-line py-2.5">
      <header className="flex min-h-7 items-center justify-between gap-2">
        <h2 className="m-0 text-xs font-bold tracking-[-0.01em] text-ink">
          {t("chatContextEyebrow")}
        </h2>
        {(hasTranscript || state.error !== null) && (
          <button
            type="button"
            className={`${buttonQuiet} !min-h-7 !px-2 !py-0.5 !text-[9px]`}
            onClick={() => {
              clear()
              setInput("")
              setUsedReplyIds(new Set())
              setExpandedUserIds(new Set())
            }}>
            <Icon name="trash" size={13} />
            {t("chatClear")}
          </button>
        )}
      </header>

      {props.subject === null && (
        <div className="grid min-h-44 place-items-center content-center px-[22px] py-[30px] text-center text-muted">
          <div className="mb-3.5 grid size-[54px] -rotate-2 place-items-center rounded-[17px_17px_17px_5px] border border-accent/25 bg-accent-soft text-accent">
            <Icon name="message" size={24} />
          </div>
          <strong className="text-[15px] text-ink">{t("chatEmptyTitle")}</strong>
          <p className="mt-1.5 mb-0 max-w-[280px] text-xs leading-7">
            {t("chatPickMarker")}
          </p>
        </div>
      )}

      {hasTranscript && (
        <div
        ref={logRef}
        className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-x-hidden overflow-y-auto overscroll-contain px-0.5 py-1.5"
        role="log"
        aria-live="polite">
        {state.messages.map((message) => (
          <article
            key={message.id}
            className={cx(
              "grid min-w-0 max-w-[96%] gap-0.5",
              message.role === "user" ? "self-end" : "self-start"
            )}>
            <header
              className={cx(
                "px-1 text-[8px] font-bold tracking-[0.04em] text-subtle",
                message.role === "user" && "text-right"
              )}>
              {message.role === "user" && t("chatRoleUser")}
              {message.role === "assistant" &&
                (message.model ?? t("chatRoleAssistant"))}
            </header>
            <div
              className={cx(
                "min-w-0 max-w-full rounded-[4px_10px_10px_10px] border border-line bg-surface px-2.5 py-2 text-xs leading-6 text-ink-soft",
                message.role === "assistant" && "whitespace-pre-wrap",
                message.role === "user" &&
                  "flex items-start gap-1.5 rounded-[10px_4px_10px_10px] border-accent/30 bg-accent-soft text-accent-ink"
              )}>
              {/* Only the model writes markdown. Parsing user text would reinterpret
                  punctuation that the reader meant literally. */}
              {message.role === "user" && (
                <>
                  <span
                    className={cx(
                      "min-w-0 flex-1",
                      expandedUserIds.has(message.id) && "whitespace-pre-wrap",
                      !expandedUserIds.has(message.id) &&
                        "overflow-hidden text-ellipsis whitespace-nowrap"
                    )}>
                    <RubyText text={message.content} />
                  </span>
                  <button
                    type="button"
                    className="grid size-5 shrink-0 cursor-pointer place-items-center rounded text-muted transition hover:bg-accent/10 hover:text-accent focus-visible:bg-accent/10 focus-visible:text-accent focus-visible:outline-none"
                    aria-expanded={expandedUserIds.has(message.id)}
                    aria-label={
                      expandedUserIds.has(message.id)
                        ? t("chatMessageCollapse")
                        : t("chatMessageExpand")
                    }
                    title={
                      expandedUserIds.has(message.id)
                        ? t("chatMessageCollapse")
                        : t("chatMessageExpand")
                    }
                    onClick={() =>
                      setExpandedUserIds((current) => {
                        const next = new Set(current)
                        if (next.has(message.id)) {
                          next.delete(message.id)
                        } else {
                          next.add(message.id)
                        }
                        return next
                      })
                    }>
                    <span
                      className={cx(
                        "transition-transform",
                        expandedUserIds.has(message.id) && "rotate-90"
                      )}>
                      <Icon name="chevron-right" size={13} />
                    </span>
                  </button>
                </>
              )}
              {message.role === "assistant" && (
                <MarkdownText text={message.content} />
              )}
            </div>
            {message.role === "assistant" && (
              <div className="flex justify-start px-1">
                <button
                  type="button"
                  className={`${buttonQuiet} !min-h-7 !px-2 !py-0.5 !text-[9px]`}
                  disabled={usedReplyIds.has(message.id)}
                  onClick={() => {
                    props.onUseReply(markdownToPlainText(message.content))
                    setUsedReplyIds((current) =>
                      new Set([...current, message.id])
                    )
                  }}>
                  <Icon
                    name={usedReplyIds.has(message.id) ? "check" : "plus"}
                    size={14}
                  />
                  {usedReplyIds.has(message.id)
                    ? t("chatAddedToNote")
                    : t("chatAddToNote")}
                </button>
              </div>
            )}
          </article>
        ))}

        {state.draft !== null && (
          <article className="grid min-w-0 max-w-[96%] self-start gap-0.5">
            <header className="px-1 text-[8px] font-bold tracking-[0.04em] text-subtle">
              {t("chatRoleAssistant")}
            </header>
            <div className="min-w-0 max-w-full whitespace-pre-wrap rounded-[4px_10px_10px_10px] border border-line bg-surface px-2.5 py-2 text-xs leading-6 text-ink-soft">
              <MarkdownText text={state.draft} />
              {state.draft === "" && (
                <span
                  className="inline-flex min-h-[18px] items-center gap-1"
                  aria-label={t("chatGenerating")}>
                  <span className="size-[5px] animate-typing rounded-full bg-muted" />
                  <span className="size-[5px] animate-typing rounded-full bg-muted [animation-delay:140ms]" />
                  <span className="size-[5px] animate-typing rounded-full bg-muted [animation-delay:280ms]" />
                </span>
              )}
            </div>
          </article>
        )}
        </div>
      )}

      {state.error !== null && <p className={errorBox}>{state.error}</p>}
      {promptError !== null && <p className={errorBox}>{promptError}</p>}

      <div className="fixed inset-x-0 bottom-[52px] z-20 grid gap-1.5 border-t border-line-strong p-2 shadow-[0_-8px_24px_rgb(0_0_0/0.08)] backdrop-blur-xl">
        {props.subject !== null && currentPrompts.length > 0 && (
          <div className="flex gap-1 overflow-x-auto py-px [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {currentPrompts.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="min-h-7 max-w-[160px] shrink-0 cursor-pointer truncate rounded-full border border-accent/30 bg-surface-tinted px-2 py-0.5 text-[9px] font-semibold text-accent-ink transition enabled:hover:border-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-45"
                disabled={disabled || loadingPresetId !== null}
                onClick={() => void submitPreset(preset.id)}>
                {preset.label}
              </button>
            ))}
          </div>
        )}
        <div className="flex min-w-0 items-end overflow-hidden rounded-ui-sm border border-line-strong bg-surface transition focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/15">
          <textarea
            className="min-h-9 max-h-20 min-w-0 flex-1 resize-none border-0 bg-transparent px-2 py-1.5 text-[11px] leading-5 text-ink outline-none placeholder:text-subtle disabled:cursor-not-allowed disabled:opacity-45"
            rows={1}
            value={input}
            placeholder={t("chatInputPlaceholder")}
            disabled={props.subject === null}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                if (!disabled && input.trim() !== "") {
                  submit(input)
                }
              }
            }}
          />
          <div className="flex shrink-0 items-center p-1">
            {!state.streaming && (
              <button
                type="button"
                className={`${buttonPrimary} !min-h-8 !px-2 !py-1 !text-[11px]`}
                disabled={disabled || input.trim() === ""}
                onClick={() => submit(input)}>
                <Icon name="send" size={15} />
                {t("chatSend")}
              </button>
            )}
            {state.streaming && (
              <button
                type="button"
                className={`${buttonDanger} !min-h-8 !px-2 !py-1 !text-[11px]`}
                onClick={abort}>
                <Icon name="stop" size={15} />
                {t("chatAbort")}
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
