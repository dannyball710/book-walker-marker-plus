import { useState } from "react"

import { t } from "~/core/i18n"
import type { ConfigField } from "~/core/provider/descriptor"

export interface ConfigFieldInputProps {
  /** namespaces the DOM id: field keys are only unique within one provider's form */
  readonly providerId: string
  readonly field: ConfigField
  readonly value: string
  readonly onChange: (value: string) => void
  /** rendered next to the input, e.g. the model-list button */
  readonly action?: React.ReactNode
  /** why background refused to save this field */
  readonly issue?: string | undefined
}

/** Renders one descriptor-declared field; secrets are masked with a reveal toggle. */
export function ConfigFieldInput(props: ConfigFieldInputProps) {
  const { field } = props
  const [revealed, setRevealed] = useState(false)
  const inputId = `field-${props.providerId}-${field.key}`
  const isSecret = field.kind === "secret"
  const inputType = isSecret && !revealed ? "password" : "text"

  return (
    <div className="field">
      <label htmlFor={inputId}>
        {field.label}
        {field.required && <span aria-hidden="true"> *</span>}
      </label>
      <div className="row">
        {field.kind === "select" && (
          <select
            id={inputId}
            value={props.value}
            onChange={(event) => props.onChange(event.target.value)}>
            <option value="">{t("fieldSelectNone")}</option>
            {(field.options ?? []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )}
        {field.kind !== "select" && (
          <input
            id={inputId}
            type={inputType}
            list={`${inputId}-options`}
            inputMode={field.kind === "number" ? "numeric" : undefined}
            value={props.value}
            placeholder={field.placeholder}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => props.onChange(event.target.value)}
          />
        )}
        {isSecret && (
          <button type="button" onClick={() => setRevealed(!revealed)}>
            {revealed && t("fieldSecretHide")}
            {!revealed && t("fieldSecretShow")}
          </button>
        )}
        {props.action}
      </div>
      {field.help !== undefined && <p className="hint">{field.help}</p>}
      {props.issue !== undefined && <p className="error">{props.issue}</p>}
    </div>
  )
}
