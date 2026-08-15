import { useCallback, useEffect, useState } from "react"

import { joinList, t } from "~/core/i18n"
import type {
  ProviderCatalogEntry,
  SettingsSetResponse
} from "~/core/messaging/protocol"
import { DEFAULT_SETTINGS } from "~/core/settings/defaults"
import type { AppSettings } from "~/core/settings/types"
import { Brand } from "~/ui/Brand"
import { Icon } from "~/ui/Icon"
import { useProviderHosts } from "~/ui/hooks/useProviderHosts"
import { catalogFor, normalizeSettings } from "~/ui/logic/settings-form"
import { fetchProviderCatalog, fetchSettings, saveSettings } from "~/ui/messages"
import { PromptSection } from "~/ui/options/PromptSection"
import { ProviderSection } from "~/ui/options/ProviderSection"
import { buttonPrimary, errorBox, eyebrow, spinner } from "~/ui/styles"
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
   * appear. `request` is a no-op that resolves true when the origins are already granted.
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
        setStatus({ kind: "denied", origins })
      })
      .catch((cause: unknown) => {
        setStatus({ kind: "failed", message: describe(cause) })
      })
  }

  // Background rejects the whole save when it reports issues, so nothing was written.
  // Each issue renders against its own input instead of being flattened into one alert.
  const reported =
    status.kind === "rejected" || status.kind === "saved" ? status.issues : null
  const storageIssues = reported?.storage ?? []
  const llmIssues = reported?.llm ?? []

  return (
    <div className="mx-auto grid min-h-screen w-full max-w-[1240px] grid-cols-[minmax(220px,270px)_minmax(0,840px)] gap-[clamp(44px,7vw,92px)] px-8 max-[760px]:block max-[760px]:px-[18px]">
      <aside className="sticky top-0 flex h-screen flex-col border-r border-line py-[52px] pr-7 max-[760px]:static max-[760px]:block max-[760px]:h-auto max-[760px]:border-0 max-[760px]:px-0 max-[760px]:pt-6 max-[760px]:pb-0">
        <Brand />
        <nav className="mt-16 grid gap-1 max-[760px]:mt-5 max-[760px]:flex max-[760px]:gap-1 max-[760px]:overflow-x-auto max-[760px]:pb-2" aria-label={t("optionsTitle")}>
          <a className="grid min-h-[46px] grid-cols-[32px_1fr] items-center rounded-ui-sm font-semibold text-muted no-underline transition hover:translate-x-1 hover:bg-surface-soft hover:text-ink max-[760px]:min-w-max max-[760px]:grid-cols-[auto_1fr] max-[760px]:gap-1.5 max-[760px]:px-2.5" href="#storage">
            <span className="text-[10px] tabular-nums tracking-[0.08em] text-subtle">01</span>
            {t("optionsStorageLegend")}
          </a>
          <a className="grid min-h-[46px] grid-cols-[32px_1fr] items-center rounded-ui-sm font-semibold text-muted no-underline transition hover:translate-x-1 hover:bg-surface-soft hover:text-ink max-[760px]:min-w-max max-[760px]:grid-cols-[auto_1fr] max-[760px]:gap-1.5 max-[760px]:px-2.5" href="#llm">
            <span className="text-[10px] tabular-nums tracking-[0.08em] text-subtle">02</span>
            {t("optionsLlmLegend")}
          </a>
          <a className="grid min-h-[46px] grid-cols-[32px_1fr] items-center rounded-ui-sm font-semibold text-muted no-underline transition hover:translate-x-1 hover:bg-surface-soft hover:text-ink max-[760px]:min-w-max max-[760px]:grid-cols-[auto_1fr] max-[760px]:gap-1.5 max-[760px]:px-2.5" href="#prompts">
            <span className="text-[10px] tabular-nums tracking-[0.08em] text-subtle">03</span>
            {t("promptsLegend")}
          </a>
        </nav>
        <div className="mt-auto flex items-start gap-2.5 border-t border-line pt-4 text-[11px] leading-relaxed text-muted max-[760px]:hidden">
          <span className="mt-1.5 size-[7px] shrink-0 rounded-full bg-success shadow-[0_0_0_3px_color-mix(in_srgb,rgb(var(--color-success))_13%,transparent)]" aria-hidden="true" />
          {t("optionsSecretsLocalNote")}
        </div>
      </aside>

      <main className="min-w-0 py-[66px] pb-[124px] max-[760px]:py-[34px] max-[760px]:pb-[100px]">
        <header className="mb-[38px] max-w-[680px]">
          <p className={eyebrow}>{t("optionsEyebrow")}</p>
          <h1 className="my-2.5 max-w-[670px] text-[clamp(32px,4.2vw,48px)] leading-[1.08] font-bold tracking-[-0.045em] text-ink max-[760px]:text-[34px]">{t("optionsTitle")}</h1>
          <p className="m-0 max-w-[630px] text-[15px] leading-7 text-muted">{t("optionsSubtitle")}</p>
        </header>

        {load.kind === "loading" && (
          <div className="flex min-h-60 items-center justify-center gap-2.5 text-muted" role="status">
            <span className={spinner} aria-hidden="true" />
            {t("optionsLoading")}
          </div>
        )}

        {/* The form is never shown on a failed read: it would be holding defaults, and
            saving those would overwrite the user's stored keys and presets. */}
        {load.kind === "failed" && (
          <div className="flex items-center justify-between gap-5 rounded-ui-md border border-danger/30 bg-danger-soft p-5 text-danger max-[760px]:items-stretch max-[760px]:flex-col" role="alert">
            <div>
              <strong>{t("optionsLoadFailed", { reason: load.message })}</strong>
              <p className="mt-1 mb-0 text-xs">{t("optionsLoadFailedHint")}</p>
            </div>
            <button type="button" className={buttonPrimary} onClick={retry}>
              {t("optionsReload")}
            </button>
          </div>
        )}

        {load.kind === "ready" && (
          <>
            <div className="grid gap-[22px]">
              <ProviderSection
                id="storage"
                legend={t("optionsStorageLegend")}
                entries={catalogFor(catalog, "storage")}
                selection={settings.storage}
                onChange={(storage) => patch({ storage })}
                note={t("optionsStorageNote")}
                issues={storageIssues}
                origins={hosts.storage}
              />
              <ProviderSection
                id="llm"
                legend={t("optionsLlmLegend")}
                entries={catalogFor(catalog, "llm")}
                selection={settings.llm}
                onChange={(llm) => patch({ llm })}
                note={t("optionsLlmNote")}
                issues={llmIssues}
                origins={hosts.llm}
              />
              <PromptSection
                responseLanguage={settings.responseLanguage}
                prompts={settings.prompts}
                onResponseLanguageChange={(responseLanguage) =>
                  patch({ responseLanguage })
                }
                onChange={(prompts) => patch({ prompts })}
              />
            </div>

            <div className="mt-5 grid gap-2">
              <div className="flex items-center gap-3 rounded-ui-sm border border-line bg-surface px-3.5 py-3 text-[11px] text-muted">
                <span className="size-[7px] shrink-0 rounded-full bg-success shadow-[0_0_0_3px_color-mix(in_srgb,rgb(var(--color-success))_13%,transparent)]" aria-hidden="true" />
                <span>{t("optionsSecretsLocalNote")}</span>
              </div>
              {hosts.origins.length > 0 && (
                <div className="flex items-baseline gap-3 rounded-ui-sm border border-line bg-surface px-3.5 py-3 text-[11px] text-muted max-[760px]:items-start max-[760px]:flex-col">
                  <strong className="text-ink-soft">{t("optionsPermissionTitle")}</strong>
                  <span>
                    {t("optionsPermissionNotice", { origins: joinList(hosts.origins) })}
                  </span>
                </div>
              )}
              {status.kind === "denied" && (
                <div className={errorBox} role="alert">
                  {t("optionsPermissionDenied", {
                    origins: joinList(status.origins)
                  })}
                </div>
              )}
            </div>

            <div className="sticky bottom-[18px] z-10 mt-6 flex items-center justify-between gap-[18px] rounded-ui-md border border-line-strong bg-surface-elevated/95 py-3 pr-3 pl-[18px] shadow-float backdrop-blur-xl max-[760px]:bottom-2 max-[760px]:p-2.5 max-[480px]:p-2">
              <div className="min-w-0 text-[11px] text-muted max-[480px]:hidden" aria-live="polite">
                {status.kind === "idle" && <span>{t("optionsSaveHint")}</span>}
                {status.kind === "saving" && (
                  <span className="inline-flex items-center gap-2">
                    <span className={spinner} aria-hidden="true" />
                    {t("optionsSaving")}
                  </span>
                )}
                {status.kind === "saved" && status.issues.llm.length === 0 && (
                  <span className="inline-flex items-center gap-2 text-success">
                    <Icon name="check" size={16} />
                    {t("optionsSaved")}
                  </span>
                )}
                {status.kind === "saved" && status.issues.llm.length > 0 && (
                  <span>{t("optionsSavedLlmIncomplete")}</span>
                )}
                {status.kind === "failed" && (
                  <span className="text-danger">{status.message}</span>
                )}
                {status.kind === "rejected" && (
                  <span className="text-danger">
                    {t("optionsNotSavedFields")}
                  </span>
                )}
                {status.kind === "denied" && (
                  <span className="text-danger">
                    {t("optionsNotSavedPermission")}
                  </span>
                )}
              </div>
              <button
                type="button"
                className={`${buttonPrimary} min-h-11 px-[18px] max-[480px]:w-full`}
                disabled={status.kind === "saving"}
                onClick={submit}>
                <Icon name="check" />
                {t("optionsSaveButton")}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

export default Options
