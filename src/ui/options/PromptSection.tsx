import { t } from "~/core/i18n"
import type { PromptPreset } from "~/core/settings/types"
import {
  addPreset,
  movePreset,
  removePreset,
  updatePreset
} from "~/ui/logic/prompts"

/** Order and wording of the list are the locale's, so it is built rather than written out. */
const PLACEHOLDER_DOCS = [
  { code: "{{text}}", describe: () => t("promptsVarText") },
  { code: "{{memo}}", describe: () => t("promptsVarMemo") },
  { code: "{{bookTitle}}", describe: () => t("promptsVarBookTitle") }
]

export interface PromptSectionProps {
  readonly prompts: readonly PromptPreset[]
  readonly onChange: (prompts: readonly PromptPreset[]) => void
}

export function PromptSection(props: PromptSectionProps) {
  const { prompts } = props

  return (
    <fieldset>
      <legend>{t("promptsLegend")}</legend>

      <p className="hint">
        {t("promptsIntro")}
        {PLACEHOLDER_DOCS.map((doc, index) => (
          <span key={doc.code}>
            {index > 0 && t("commonListSeparator")}
            <code>{doc.code}</code>
            {doc.describe()}
          </span>
        ))}
      </p>

      {prompts.length === 0 && <p className="hint">{t("promptsEmpty")}</p>}

      {prompts.map((preset, index) => (
        <div key={preset.id} className="preset-card">
          <div className="field">
            <label htmlFor={`preset-label-${preset.id}`}>{t("promptLabelField")}</label>
            <input
              id={`preset-label-${preset.id}`}
              type="text"
              value={preset.label}
              onChange={(event) =>
                props.onChange(
                  updatePreset(prompts, preset.id, { label: event.target.value })
                )
              }
            />
          </div>
          <div className="field">
            <label htmlFor={`preset-template-${preset.id}`}>{t("promptTemplateField")}</label>
            <textarea
              id={`preset-template-${preset.id}`}
              rows={3}
              value={preset.template}
              onChange={(event) =>
                props.onChange(
                  updatePreset(prompts, preset.id, { template: event.target.value })
                )
              }
            />
          </div>
          <div className="row">
            <button
              type="button"
              disabled={index === 0}
              onClick={() => props.onChange(movePreset(prompts, preset.id, "up"))}>
              {t("promptMoveUp")}
            </button>
            <button
              type="button"
              disabled={index === prompts.length - 1}
              onClick={() => props.onChange(movePreset(prompts, preset.id, "down"))}>
              {t("promptMoveDown")}
            </button>
            <span style={{ flex: 1 }} />
            <button
              type="button"
              className="danger"
              onClick={() => props.onChange(removePreset(prompts, preset.id))}>
              {t("commonDelete")}
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() => props.onChange(addPreset(prompts, crypto.randomUUID()))}>
        {t("promptAdd")}
      </button>
    </fieldset>
  )
}
