import { useState } from "react"

import { joinList, t } from "~/core/i18n"
import type { ProviderCatalogEntry } from "~/core/messaging/protocol"
import type { ConfigIssue, ConfigValues } from "~/core/provider/descriptor"
import type { ProviderSelection } from "~/core/settings/types"
import {
  activeEntry,
  missingRequiredFields,
  setActiveProvider,
  setConfigValue,
  valueOf
} from "~/ui/logic/settings-form"
import { fetchLlmModels } from "~/ui/messages"
import { buttonSecondary, cx, errorBox, spinner } from "~/ui/styles"
import { ConfigFieldInput } from "./ConfigFieldInput"
import { NotionDatabaseSetup } from "./NotionDatabaseSetup"

export interface ProviderSectionProps {
  readonly id: string
  readonly legend: string
  readonly entries: readonly ProviderCatalogEntry[]
  readonly selection: ProviderSelection
  readonly onChange: (selection: ProviderSelection) => void
  readonly note?: string
  /** why background refused the last save, keyed by field */
  readonly issues: readonly ConfigIssue[]
  /** this section's provider origins only — never the other section's */
  readonly origins: readonly string[]
}

type ModelsState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "loaded"; readonly models: readonly string[] }
  | { readonly kind: "denied"; readonly origins: readonly string[] }
  | { readonly kind: "failed" }

/** Provider-agnostic: every provider-specific field still comes from its descriptor. */
export function ProviderSection(props: ProviderSectionProps) {
  const { entries, selection } = props
  const [models, setModels] = useState<ModelsState>({ kind: "idle" })
  const active = activeEntry(selection, entries)
  const hasConfiguration =
    active !== null && (active.fields.length > 0 || active.docsUrl !== undefined)
  const issueFor = (key: string): string | undefined =>
    props.issues.find((issue) => issue.field === key)?.message
  const providerIssue = issueFor("active")
  const activeValues =
    active === null
      ? {}
      : selection.configs.find((config) => config.providerId === active.id)
          ?.values ?? {}

  const requestModels = (providerId: string, values: ConfigValues) => {
    fetchLlmModels(providerId, values)
      .then((list) => {
        setModels(
          list.length === 0 ? { kind: "failed" } : { kind: "loaded", models: list }
        )
      })
      .catch(() => setModels({ kind: "failed" }))
  }

  /** Nothing may be awaited before the permission request consumes this user gesture. */
  const loadModels = (entry: ProviderCatalogEntry) => {
    const values =
      selection.configs.find((config) => config.providerId === entry.id)?.values ?? {}
    const { origins } = props
    setModels({ kind: "loading" })

    if (origins.length === 0) {
      requestModels(entry.id, values)
      return
    }
    chrome.permissions
      .request({ origins: [...origins] })
      .then((granted) => {
        if (granted) {
          requestModels(entry.id, values)
          return
        }
        setModels({ kind: "denied", origins })
      })
      .catch(() => setModels({ kind: "failed" }))
  }

  return (
    <section
      id={props.id}
      className="scroll-mt-6 rounded-ui-lg border border-line bg-surface-elevated p-[clamp(20px,3.2vw,30px)] shadow-card max-[760px]:rounded-ui-md max-[760px]:px-[15px] max-[760px]:py-[19px]">
      <header className="mb-6 grid grid-cols-[34px_1fr] gap-2 max-[760px]:grid-cols-[27px_1fr]">
        <span className="pt-1 text-[10px] font-bold tracking-[0.08em] text-accent" aria-hidden="true">
          {props.id === "storage" ? "01" : "02"}
        </span>
        <div>
          <h2 className="m-0 text-[22px] leading-tight font-bold tracking-[-0.025em] text-ink">
            {props.legend}
          </h2>
          {props.note !== undefined && (
            <p className="mt-2 mb-0 max-w-[680px] text-xs leading-7 text-muted">
              {props.note}
            </p>
          )}
        </div>
      </header>

      {entries.length === 0 && (
        <p className="m-0 rounded-ui-md border border-dashed border-line-strong p-4 text-center text-muted">
          {t("providersEmpty")}
        </p>
      )}

      <div
        className="mb-[18px] grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2"
        role="radiogroup"
        aria-label={props.legend}>
        {entries.map((entry) => {
          const selected = selection.active === entry.id
          return (
            <label
              key={entry.id}
              className={cx(
                "relative grid min-h-[60px] cursor-pointer grid-cols-[18px_1fr] items-center gap-2 rounded-ui-md border border-line bg-surface px-3 py-2.5 text-ink-soft shadow-none transition hover:-translate-y-px hover:border-accent/45 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-accent/40",
                selected && "border-accent/60 bg-surface-tinted text-accent-ink shadow-[inset_0_0_0_1px_color-mix(in_srgb,rgb(var(--color-accent))_16%,transparent)]"
              )}>
              <input
                className="absolute size-px opacity-0"
                type="radio"
                name={`provider-${props.id}`}
                checked={selected}
                onChange={() => {
                  setModels({ kind: "idle" })
                  props.onChange(setActiveProvider(selection, entry.id))
                }}
              />
              <span
                className={cx(
                  "grid size-[17px] place-items-center rounded-full border-[1.5px] border-line-strong bg-surface",
                  selected && "border-[5px] border-accent"
                )}
                aria-hidden="true"
              />
              <span className="font-semibold">{entry.label}</span>
              {selected && (
                <span className="col-start-2 -mt-2 text-[10px] text-accent">
                  {t("providerSelected")}
                </span>
              )}
            </label>
          )
        })}
      </div>

      {providerIssue !== undefined && <p className={errorBox}>{providerIssue}</p>}

      {active !== null && hasConfiguration && (
        <div className="mt-[18px] rounded-ui-md border border-line bg-surface-soft/55 p-5">
          <div className="mb-[18px] text-xs text-ink-soft">
            <strong>{t("providerConfigure", { label: active.label })}</strong>
          </div>

          <div className="grid gap-[17px]">
            {active.fields
              .filter(
                (field) =>
                  active.optionsTool !== "notion-database" ||
                  field.key !== "databaseId"
              )
              .map((field) => {
              const isModelField = field.key === active.modelField
              return (
                <ConfigFieldInput
                  key={field.key}
                  providerId={active.id}
                  field={field}
                  value={valueOf(selection, active.id, field)}
                  onChange={(value) =>
                    props.onChange(
                      setConfigValue(selection, active.id, field.key, value)
                    )
                  }
                  action={
                    isModelField ? (
                      <button
                        type="button"
                        className={buttonSecondary}
                        disabled={models.kind === "loading"}
                        onClick={() => loadModels(active)}>
                        {t("providerLoadModels")}
                      </button>
                    ) : undefined
                  }
                  issue={issueFor(field.key)}
                />
              )
            })}

            {active.optionsTool === "notion-database" && (
              <NotionDatabaseSetup
                pat={activeValues.pat ?? ""}
                databaseId={activeValues.databaseId ?? ""}
                origins={props.origins}
                issue={issueFor("databaseId")}
                onDatabaseIdChange={(databaseId) =>
                  props.onChange(
                    setConfigValue(
                      selection,
                      active.id,
                      "databaseId",
                      databaseId
                    )
                  )
                }
              />
            )}
          </div>

          {active.modelField !== undefined && models.kind === "loading" && (
            <p className="mt-1.5 mb-0 flex items-center gap-2 text-[11px] text-muted" role="status">
              <span className={spinner} aria-hidden="true" />
              {t("commonLoading")}
            </p>
          )}
          {active.modelField !== undefined && models.kind === "loaded" && (
            <>
              <datalist id={`field-${active.id}-${active.modelField}-options`}>
                {models.models.map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
              <p className="mt-1.5 mb-0 text-[11px] text-success">
                {t("providerModelsLoaded", { count: String(models.models.length) })}
              </p>
            </>
          )}
          {models.kind === "denied" && (
            <p className={errorBox}>
              {t("providerModelsDenied", {
                origins: joinList(models.origins),
                label: active.label
              })}
            </p>
          )}
          {models.kind === "failed" && (
            <p className={errorBox}>
              {t("providerModelsFailed", { label: active.label })}
            </p>
          )}

          {missingRequiredFields(selection, active).map((field) => (
            <p key={field.key} className="mt-1.5 mb-0 text-[11px] leading-relaxed text-warning">
              {t("providerFieldMissing", { label: field.label })}
            </p>
          ))}

          {active.docsUrl !== undefined && (
            <p className="mt-1.5 mb-0 text-[11px] leading-relaxed text-muted">
              {t("providerDocsLabel")}
              <a
                className="text-accent underline decoration-accent/40 underline-offset-3"
                href={active.docsUrl}
                target="_blank"
                rel="noreferrer">
                {active.docsUrl}
              </a>
            </p>
          )}
        </div>
      )}

      {active === null && entries.length > 0 && (
        <p className={errorBox}>
          {t("providerUnknownSelected", { id: selection.active })}
        </p>
      )}
    </section>
  )
}
