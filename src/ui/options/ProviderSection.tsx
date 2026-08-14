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
import { ConfigFieldInput } from "./ConfigFieldInput"

export interface ProviderSectionProps {
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

/**
 * Provider-agnostic on purpose: every provider-specific label, field and hint comes from
 * the catalog, so adding a backend needs no change here.
 */
export function ProviderSection(props: ProviderSectionProps) {
  const { entries, selection } = props
  const [models, setModels] = useState<ModelsState>({ kind: "idle" })
  const active = activeEntry(selection, entries)
  const issueFor = (key: string): string | undefined =>
    props.issues.find((issue) => issue.field === key)?.message
  // `active` is the provider choice itself, so it has no input to sit under.
  const providerIssue = issueFor("active")

  const requestModels = (providerId: string, values: ConfigValues) => {
    fetchLlmModels(providerId, values)
      .then((list) => {
        // The provider contract returns [] instead of throwing, so empty means failure.
        setModels(
          list.length === 0 ? { kind: "failed" } : { kind: "loaded", models: list }
        )
      })
      .catch(() => setModels({ kind: "failed" }))
  }

  /**
   * The endpoint lives in `optional_host_permissions`, and this button is the first thing
   * the user presses — before the save that would otherwise have asked for it. Nothing may
   * be awaited ahead of `chrome.permissions.request`: it only prompts while the click is
   * still on the stack, which is why the origins arrive as a prop already resolved.
   */
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
    <fieldset>
      <legend>{props.legend}</legend>

      {entries.length === 0 && <p className="hint">{t("providersEmpty")}</p>}

      {entries.map((entry) => (
        <div key={entry.id} className="field">
          <label>
            <input
              type="radio"
              name={`provider-${props.legend}`}
              checked={selection.active === entry.id}
              onChange={() => {
                setModels({ kind: "idle" })
                props.onChange(setActiveProvider(selection, entry.id))
              }}
            />{" "}
            {entry.label}
          </label>
        </div>
      ))}

      {providerIssue !== undefined && <p className="error">{providerIssue}</p>}

      {props.note !== undefined && <p className="hint">{props.note}</p>}

      {active !== null && (
        <>
          {active.fields.map((field) => {
            const isModelField = field.key === active.modelField
            return (
              <ConfigFieldInput
                key={field.key}
                providerId={active.id}
                field={field}
                value={valueOf(selection, active.id, field)}
                onChange={(value) =>
                  props.onChange(setConfigValue(selection, active.id, field.key, value))
                }
                action={
                  <>
                    {isModelField && (
                      <button
                        type="button"
                        disabled={models.kind === "loading"}
                        onClick={() => loadModels(active)}>
                        {t("providerLoadModels")}
                      </button>
                    )}
                  </>
                }
                issue={issueFor(field.key)}
              />
            )
          })}

          {active.modelField !== undefined && models.kind === "loading" && (
            <p className="hint">{t("commonLoading")}</p>
          )}
          {active.modelField !== undefined && models.kind === "loaded" && (
            <>
              <datalist id={`field-${active.id}-${active.modelField}-options`}>
                {models.models.map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
              <p className="hint">
                {t("providerModelsLoaded", { count: String(models.models.length) })}
              </p>
            </>
          )}
          {models.kind === "denied" && (
            <p className="error">
              {t("providerModelsDenied", {
                origins: joinList(models.origins),
                label: active.label
              })}
            </p>
          )}
          {models.kind === "failed" && (
            <p className="error">{t("providerModelsFailed", { label: active.label })}</p>
          )}

          {missingRequiredFields(selection, active).map((field) => (
            <p key={field.key} className="hint">
              {t("providerFieldMissing", { label: field.label })}
            </p>
          ))}

          {active.docsUrl !== undefined && (
            <p className="hint">
              {t("providerDocsLabel")}
              <a href={active.docsUrl} target="_blank" rel="noreferrer">
                {active.docsUrl}
              </a>
            </p>
          )}
        </>
      )}

      {active === null && entries.length > 0 && (
        <p className="error">{t("providerUnknownSelected", { id: selection.active })}</p>
      )}
    </fieldset>
  )
}
