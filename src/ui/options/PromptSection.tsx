import { t } from "~/core/i18n"
import type { PromptPreset } from "~/core/settings/types"
import { Icon } from "~/ui/Icon"
import {
  addPreset,
  movePreset,
  removePreset,
  updatePreset
} from "~/ui/logic/prompts"
import { buttonIcon, buttonIconDanger, buttonSecondary, cx, fieldControl } from "~/ui/styles"

/** Order and wording of the list are the locale's, so it is built rather than written out. */
const PLACEHOLDER_DOCS = [
  { code: "{{text}}", describe: () => t("promptsVarText") },
  { code: "{{memo}}", describe: () => t("promptsVarMemo") },
  { code: "{{bookTitle}}", describe: () => t("promptsVarBookTitle") },
  {
    code: "{{responseLanguage}}",
    describe: () => t("promptsVarResponseLanguage")
  }
]

export interface PromptSectionProps {
  readonly responseLanguage: string
  readonly prompts: readonly PromptPreset[]
  readonly onResponseLanguageChange: (responseLanguage: string) => void
  readonly onChange: (prompts: readonly PromptPreset[]) => void
}

export function PromptSection(props: PromptSectionProps) {
  const { prompts } = props

  return (
    <section
      id="prompts"
      className="scroll-mt-6 rounded-ui-lg border border-line bg-surface-elevated p-[clamp(20px,3.2vw,30px)] shadow-card max-[760px]:rounded-ui-md max-[760px]:px-[15px] max-[760px]:py-[19px]">
      <header className="mb-6 grid grid-cols-[34px_1fr] gap-2 max-[760px]:grid-cols-[27px_1fr]">
        <span className="pt-1 text-[10px] font-bold tracking-[0.08em] text-accent" aria-hidden="true">
          03
        </span>
        <div>
          <h2 className="m-0 text-[22px] leading-tight font-bold tracking-[-0.025em] text-ink">
            {t("promptsLegend")}
          </h2>
          <p className="mt-2 mb-0 max-w-[680px] text-xs leading-7 text-muted">
            {t("promptsIntro")}
          </p>
        </div>
      </header>

      <div className="mb-5 ml-[43px] grid max-w-[520px] gap-1.5 max-[760px]:ml-9">
        <label
          className="text-xs font-semibold text-ink-soft"
          htmlFor="assistant-response-language">
          {t("assistantResponseLanguageLabel")}
        </label>
        <input
          id="assistant-response-language"
          type="text"
          className={fieldControl}
          value={props.responseLanguage}
          placeholder={t("assistantResponseLanguage")}
          onChange={(event) =>
            props.onResponseLanguageChange(event.target.value)
          }
        />
        <p className="m-0 text-[10px] leading-5 text-muted">
          {t("assistantResponseLanguageHelp")}
        </p>
      </div>

      <div
        className="mb-5 ml-[43px] flex flex-wrap gap-2 max-[760px]:ml-9"
        aria-label={t("promptsPlaceholdersLabel")}>
        {PLACEHOLDER_DOCS.map((doc) => (
          <span
            key={doc.code}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-soft px-2.5 py-1.5 text-[10px] text-muted">
            <code className="font-mono font-bold text-accent-ink">{doc.code}</code>
            <span>{doc.describe()}</span>
          </span>
        ))}
      </div>

      {prompts.length === 0 && (
        <p className="m-0 rounded-ui-md border border-dashed border-line-strong p-4 text-center text-muted">
          {t("promptsEmpty")}
        </p>
      )}

      <div className="grid gap-3">
        {prompts.map((preset, index) => (
          <article
            key={preset.id}
            className="overflow-hidden rounded-ui-md border border-line bg-surface">
            <header className="flex min-h-[49px] items-center justify-between gap-3 border-b border-line bg-surface-soft/50 py-2 pr-2.5 pl-3.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="text-[10px] tabular-nums text-accent">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <strong className="truncate text-xs text-ink-soft">
                  {preset.label === "" ? t("promptNewLabel") : preset.label}
                </strong>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  className={buttonIcon}
                  title={t("promptMoveUp")}
                  aria-label={t("promptMoveUp")}
                  disabled={index === 0}
                  onClick={() => props.onChange(movePreset(prompts, preset.id, "up"))}>
                  <Icon name="arrow-up" size={17} />
                </button>
                <button
                  type="button"
                  className={buttonIcon}
                  title={t("promptMoveDown")}
                  aria-label={t("promptMoveDown")}
                  disabled={index === prompts.length - 1}
                  onClick={() => props.onChange(movePreset(prompts, preset.id, "down"))}>
                  <Icon name="arrow-down" size={17} />
                </button>
                <button
                  type="button"
                  className={buttonIconDanger}
                  title={t("commonDelete")}
                  aria-label={t("commonDelete")}
                  onClick={() => props.onChange(removePreset(prompts, preset.id))}>
                  <Icon name="trash" size={17} />
                </button>
              </div>
            </header>

            <div className="grid gap-[15px] p-4">
              <div className="min-w-0">
                <label
                  className="mb-1.5 block text-xs font-semibold text-ink-soft"
                  htmlFor={`preset-label-${preset.id}`}>
                  {t("promptLabelField")}
                </label>
                <input
                  className={fieldControl}
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
              <div className="min-w-0">
                <label
                  className="mb-1.5 block text-xs font-semibold text-ink-soft"
                  htmlFor={`preset-template-${preset.id}`}>
                  {t("promptTemplateField")}
                </label>
                <textarea
                  className={cx(fieldControl, "min-h-[112px] resize-y leading-relaxed")}
                  id={`preset-template-${preset.id}`}
                  rows={4}
                  value={preset.template}
                  onChange={(event) =>
                    props.onChange(
                      updatePreset(prompts, preset.id, { template: event.target.value })
                    )
                  }
                />
              </div>
            </div>
          </article>
        ))}
      </div>

      <button
        type="button"
        className={`${buttonSecondary} mt-3.5`}
        onClick={() => props.onChange(addPreset(prompts, crypto.randomUUID()))}>
        <Icon name="plus" />
        {t("promptAdd")}
      </button>
    </section>
  )
}
