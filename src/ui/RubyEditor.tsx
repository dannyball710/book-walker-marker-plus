import { useEffect, useRef, useState } from "react"

import { RubyText } from "~/core/ruby/render"

export interface RubyEditorProps {
  readonly value: string
  readonly onChange: (value: string) => void
  readonly placeholder: string
  readonly rows?: number
  readonly disabled?: boolean
}

/**
 * Editing shows the raw `{漢字|かんじ}` source; blurring shows it rendered, so the user can
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
    onClick: startEditing,
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault()
        startEditing()
      }
    }
  }

  return (
    <div>
      {editing && (
        <textarea
          ref={textareaRef}
          value={props.value}
          rows={props.rows ?? 4}
          placeholder={props.placeholder}
          disabled={props.disabled}
          onChange={(event) => props.onChange(event.target.value)}
          onBlur={() => setEditing(false)}
        />
      )}
      {!editing && props.value !== "" && (
        <div className="ruby-preview" {...previewProps}>
          <RubyText text={props.value} />
        </div>
      )}
      {!editing && props.value === "" && (
        <div className="ruby-preview ruby-preview--empty" {...previewProps}>
          {props.placeholder}
        </div>
      )}
    </div>
  )
}
