import { useState } from "react"

import type { ChatSubject } from "~/core/chat/types"
import { t } from "~/core/i18n"
import { MarkdownText } from "~/core/markdown/render"
import { expandPrompt, type PromptVars } from "~/core/prompt/expand"
import { RubyText } from "~/core/ruby/render"
import type { PromptPreset } from "~/core/settings/types"
import { useChatStream } from "~/ui/hooks/useChatStream"

export interface ChatbotProps {
  /** a marker or an unsaved selection; null when nothing is loaded */
  readonly subject: ChatSubject | null
  readonly context: PromptVars
  readonly prompts: readonly PromptPreset[]
}

export function Chatbot(props: ChatbotProps) {
  const { state, send, abort } = useChatStream(props.subject)
  const [input, setInput] = useState("")
  const disabled = props.subject === null || state.streaming

  const submit = (prompt: string, display?: string) => {
    send(prompt, display)
    setInput("")
  }

  return (
    <>
      <h2 className="section-title">{t("chatSectionTitle")}</h2>

      {props.subject === null && (
        <p className="hint">{t("chatPickMarker")}</p>
      )}

      {/* The conversation lives only in this panel, so the reader has to be told before
          they invest in one — losing it silently is the surprise worth preventing. */}
      {props.subject !== null && (
        <p className="hint">{t("chatNotStored")}</p>
      )}

      {/* The raw template is sent; expandPrompt only renders it for the message list,
          because background expands the placeholders against the subject it holds. */}
      {props.subject !== null && (
        <div className="preset-row">
          {props.prompts.map((preset) => (
            <button
              key={preset.id}
              type="button"
              disabled={disabled}
              onClick={() =>
                submit(preset.template, expandPrompt(preset.template, props.context))
              }>
              {preset.label}
            </button>
          ))}
        </div>
      )}

      <div className="chat-log">
        {state.messages.map((message) => (
          <div
            key={message.id}
            className={
              message.role === "user" ? "chat-msg chat-msg--user" : "chat-msg"
            }>
            <span className="chat-msg__role">
              {message.role === "user" && t("chatRoleUser")}
              {message.role === "assistant" && (message.model ?? t("chatRoleAssistant"))}
            </span>
            {/* Only the model writes markdown. The user's own text is whatever they
                typed, and parsing it would swallow characters they meant literally. */}
            {message.role === "user" && <RubyText text={message.content} />}
            {message.role === "assistant" && <MarkdownText text={message.content} />}
          </div>
        ))}

        {state.draft !== null && (
          <div className="chat-msg">
            <span className="chat-msg__role">{t("chatRoleAssistant")}</span>
            <MarkdownText text={state.draft} />
            {state.draft === "" && <span className="hint">{t("chatGenerating")}</span>}
          </div>
        )}
      </div>

      {state.error !== null && <p className="error">{state.error}</p>}

      <div className="row" style={{ marginTop: 6 }}>
        <textarea
          rows={2}
          value={input}
          placeholder={t("chatInputPlaceholder")}
          disabled={props.subject === null}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              if (!disabled) {
                submit(input)
              }
            }
          }}
        />
        {!state.streaming && (
          <button
            type="button"
            className="primary"
            disabled={disabled || input.trim() === ""}
            onClick={() => submit(input)}>
            {t("chatSend")}
          </button>
        )}
        {state.streaming && (
          <button type="button" className="danger" onClick={abort}>
            {t("chatAbort")}
          </button>
        )}
      </div>
    </>
  )
}
