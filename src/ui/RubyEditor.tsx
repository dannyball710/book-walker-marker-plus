import { useEffect, useRef, useState } from "react"

import { RubyText } from "~/core/ruby/render"
import { fieldControl } from "~/ui/styles"

export interface RubyEditorProps {
  readonly value: string
  readonly onChange: (value: string) => void
  readonly placeholder: string
  readonly ariaLabel: string
  readonly rows?: number
  readonly disabled?: boolean
}

/**
 * Editing shows the raw ruby annotation source; blurring shows it rendered, so the user can
 * proof-read the furigana without a separate preview pane.
 */
export function RubyEditor(props: RubyEditorProps) {
  const [editing, setEditing] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (editing) {
      textareaRef.current?.focus()
    }
  }, [editing])

  const startEditing = () => {
    if (props.disabled !== true) {
      setEditing(true)
    }
  }

  // The preview replaces a textarea, so it has to be reachable and openable by keyboard.
  const previewProps = {
    role: "button",
    tabIndex: 0,
    "aria-label": props.ariaLabel,
    onClick: startEditing,
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault()
        startEditing()
      }
    }
  }

  const previewClass =
    "h-[68px] cursor-text overflow-y-auto whitespace-pre-wrap rounded-ui-sm border border-line-strong bg-surface px-2.5 py-2 text-xs leading-6 transition hover:border-accent/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/40"

  return (
    <div>
      {editing && (
        <textarea
          ref={textareaRef}
          value={props.value}
          aria-label={props.ariaLabel}
          className={`${fieldControl} h-[68px] resize-none overflow-y-auto py-2 text-xs leading-6`}
          rows={props.rows ?? 2}
          placeholder={props.placeholder}
          disabled={props.disabled}
          onChange={(event) => props.onChange(event.target.value)}
          onBlur={() => setEditing(false)}
        />
      )}
      {!editing && props.value !== "" && (
        <div className={`${previewClass} text-ink`} {...previewProps}>
          <RubyText text={props.value} />
        </div>
      )}
      {!editing && props.value === "" && (
        <div className={`${previewClass} text-subtle`} {...previewProps}>
          {props.placeholder}
        </div>
      )}
    </div>
  )
}
