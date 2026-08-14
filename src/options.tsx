import { useCallback, useEffect, useState } from "react"

import { joinList, t } from "~/core/i18n"
import type {
  ProviderCatalogEntry,
  SettingsSetResponse
} from "~/core/messaging/protocol"
import { DEFAULT_SETTINGS } from "~/core/settings/defaults"
import type { AppSettings } from "~/core/settings/types"
import { PromptSection } from "~/ui/options/PromptSection"
import { ProviderSection } from "~/ui/options/ProviderSection"
import { useProviderHosts } from "~/ui/hooks/useProviderHosts"
import { catalogFor, normalizeSettings } from "~/ui/logic/settings-form"
import { fetchProviderCatalog, fetchSettings, saveSettings } from "~/ui/messages"
import "~/ui/ui.css"

type LoadState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready" }
  | { readonly kind: "failed"; readonly message: string }

type SaveStatus =
  | { readonly kind: "idle" }
  | { readonly kind: "saving" }
  | { readonly kind: "saved"; readonly issues: SettingsSetResponse }
  | { readonly kind: "rejected"; readonly issues: SettingsSetResponse }
  | { readonly kind: "denied"; readonly origins: readonly string[] }
  | { readonly kind: "failed"; readonly message: string }

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

function Options() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [catalog, setCatalog] = useState<readonly ProviderCatalogEntry[]>([])
  const [load, setLoad] = useState<LoadState>({ kind: "loading" })
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" })

  useEffect(() => {
    let alive = true
    setLoad({ kind: "loading" })
    Promise.all([fetchSettings(), fetchProviderCatalog()])
      .then(([stored, providers]) => {
        if (alive) {
          setSettings(stored)
          setCatalog(providers)
          setLoad({ kind: "ready" })
        }
      })
      .catch((cause: unknown) => {
        if (alive) {
          setLoad({ kind: "failed", message: describe(cause) })
        }
      })
    return () => {
      alive = false
    }
  }, [attempt])

  const retry = useCallback(() => setAttempt((value) => value + 1), [])
  // Kept fresh ahead of the click: chrome.permissions.request only prompts inside the
  // gesture, so there is no opportunity to ask background once the button is pressed.
  const hosts = useProviderHosts(catalog, settings.storage, settings.llm)

  const patch = (next: Partial<AppSettings>) => {
    setStatus({ kind: "idle" })
    setSettings((current) => ({ ...current, ...next }))
  }

  const persist = (next: AppSettings) => {
    saveSettings(next)
      .then((issues) => {
        // Storage issues block the write; LLM issues are advisory and still persist,
        // so `saved` is the only honest signal for what happened.
        setStatus(
          issues.saved ? { kind: "saved", issues } : { kind: "rejected", issues }
        )
      })
      .catch((cause: unknown) => {
        setStatus({ kind: "failed", message: describe(cause) })
      })
  }

  /**
   * Everything before `chrome.permissions.request` is synchronous on purpose: the call
   * only prompts while the click that triggered it is still on the stack, so awaiting a
   * `permissions.contains` check first would spend the gesture and the prompt would never
   * appear. `request` is a no-op that resolves true when the origins are already granted,
   * which makes the separate check unnecessary anyway.
   */
  const submit = () => {
    const normalized = normalizeSettings(settings, catalog)
    setSettings(normalized)
    setStatus({ kind: "saving" })

    const { origins } = hosts
    if (origins.length === 0) {
      persist(normalized)
      return
    }
    chrome.permissions
      .request({ origins: [...origins] })
      .then((granted) => {
        if (granted) {
          persist(normalized)
          return
        }
        // Storing a key we can never use is the same trap as saving over one that works.
        setStatus({ kind: "denied", origins })
      })
      .catch((cause: unknown) => {
        setStatus({ kind: "failed", message: describe(cause) })
      })
  }

  // Background rejects the whole save when it reports issues, so nothing was written —
  // saying "saved" would be a lie. Each issue renders against its own input instead.
  const reported =
    status.kind === "rejected" || status.kind === "saved" ? status.issues : null
  const storageIssues = reported?.storage ?? []
  const llmIssues = reported?.llm ?? []


  return (
    <div className="options">
      <h1>{t("optionsTitle")}</h1>

      {load.kind === "loading" && <p className="hint">{t("optionsLoading")}</p>}

      {/* The form is never shown on a failed read: it would be holding defaults, and
          saving those would overwrite the user's stored keys and presets. */}
      {load.kind === "failed" && (
        <>
          <p className="error">
            {t("optionsLoadFailed", { reason: load.message })}
            <br />
            {t("optionsLoadFailedHint")}
          </p>
          <button type="button" className="primary" onClick={retry}>
            {t("optionsReload")}
          </button>
        </>
      )}

      {load.kind === "ready" && (
        <>
          <ProviderSection
            legend={t("optionsStorageLegend")}
            entries={catalogFor(catalog, "storage")}
            selection={settings.storage}
            onChange={(storage) => patch({ storage })}
            note={t("optionsStorageNote")}
            issues={storageIssues}
            origins={hosts.storage}
          />
          <ProviderSection
            legend={t("optionsLlmLegend")}
            entries={catalogFor(catalog, "llm")}
            selection={settings.llm}
            onChange={(llm) => patch({ llm })}
            issues={llmIssues}
            origins={hosts.llm}
          />
          <PromptSection
            prompts={settings.prompts}
            onChange={(prompts) => patch({ prompts })}
          />

          <p className="hint">{t("optionsSecretsLocalNote")}</p>

          {/* Announced before the click: a permission prompt with no explanation is the
              one users dismiss. */}
          {hosts.origins.length > 0 && (
            <p className="hint">
              {t("optionsPermissionNotice", { origins: joinList(hosts.origins) })}
            </p>
          )}

          {status.kind === "denied" && (
            <p className="error">
              {t("optionsPermissionDenied", { origins: joinList(status.origins) })}
            </p>
          )}

          <div className="sticky-actions">
            <button
              type="button"
              className="primary"
              disabled={status.kind === "saving"}
              onClick={submit}>
              {t("optionsSaveButton")}
            </button>
            {status.kind === "saved" && status.issues.llm.length === 0 && (
              <span className="hint">{t("optionsSaved")}</span>
            )}
            {status.kind === "saved" && status.issues.llm.length > 0 && (
              <span className="hint">{t("optionsSavedLlmIncomplete")}</span>
            )}
            {status.kind === "failed" && <span className="error">{status.message}</span>}
            {status.kind === "rejected" && (
              <span className="error">{t("optionsNotSavedFields")}</span>
            )}
            {status.kind === "denied" && (
              <span className="error">{t("optionsNotSavedPermission")}</span>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default Options
