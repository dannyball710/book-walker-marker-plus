import { useState } from "react"

import { t } from "~/core/i18n"
import type { ConfigField } from "~/core/provider/descriptor"
import { Icon } from "~/ui/Icon"
import { buttonIconText, cx, fieldControl } from "~/ui/styles"

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
  const helpId = `${inputId}-help`
  const issueId = `${inputId}-issue`
  const isSecret = field.kind === "secret"
  const inputType = isSecret && !revealed ? "password" : "text"
  const describedBy =
    props.issue !== undefined ? issueId : field.help !== undefined ? helpId : undefined

  return (
    <div className="min-w-0">
      <label
        className="mb-1.5 flex items-baseline justify-between gap-2.5 text-xs font-semibold text-ink-soft"
        htmlFor={inputId}>
        <span>{field.label}</span>
        {field.required && (
          <span className="text-[10px] font-medium text-subtle">
            {t("fieldRequired")}
          </span>
        )}
      </label>
      <div className="flex items-stretch gap-2 max-[760px]:flex-wrap">
        {field.kind === "select" && (
          <select
            className={cx(fieldControl, "flex-1 max-[760px]:basis-full")}
            id={inputId}
            value={props.value}
            aria-invalid={props.issue !== undefined}
            aria-describedby={describedBy}
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
            className={cx(fieldControl, "flex-1 max-[760px]:basis-full")}
            id={inputId}
            type={inputType}
            list={`${inputId}-options`}
            inputMode={field.kind === "number" ? "numeric" : undefined}
            value={props.value}
            placeholder={field.placeholder}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={props.issue !== undefined}
            aria-describedby={describedBy}
            onChange={(event) => props.onChange(event.target.value)}
          />
        )}
        {isSecret && (
          <button
            type="button"
            className={buttonIconText}
            onClick={() => setRevealed(!revealed)}>
            <Icon name={revealed ? "eye-off" : "eye"} size={17} />
            {revealed ? t("fieldSecretHide") : t("fieldSecretShow")}
          </button>
        )}
        {props.action}
      </div>
      {field.help !== undefined && (
        <p id={helpId} className="mt-1.5 mb-0 text-[11px] leading-relaxed text-muted">
          {field.help}
        </p>
      )}
      {props.issue !== undefined && (
        <p id={issueId} className="mt-1.5 mb-0 text-[11px] leading-relaxed text-danger">
          {props.issue}
        </p>
      )}
    </div>
  )
}
