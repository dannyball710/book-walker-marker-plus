/**
 * Providers (marker stores, LLM backends) are described declaratively so that adding one
 * means adding a module and registering it — no switch statements, no new settings fields,
 * no options-page changes. The options UI renders `fields`, settings store the raw values,
 * and each provider parses those values into its own typed config internally.
 */

import { joinList, t } from "~/core/i18n"

export type ConfigFieldKind = "text" | "secret" | "url" | "number" | "select"

export interface ConfigFieldOption {
  readonly value: string
  readonly label: string
}

export interface ConfigField {
  readonly key: string
  readonly label: string
  readonly kind: ConfigFieldKind
  readonly required: boolean
  readonly placeholder?: string
  readonly help?: string
  /** select only */
  readonly options?: readonly ConfigFieldOption[]
}

/** Everything a config form holds. Typed parsing happens inside the owning provider. */
export type ConfigValues = { readonly [fieldKey: string]: string }

export interface ConfigIssue {
  readonly field: string
  readonly message: string
}

/**
 * Issue messages reach the options page and the service-worker log, so a provider that
 * echoes the offending value in a `.refine` message would leak a key. Masking here makes
 * that a guarantee of the code rather than a rule authors have to remember.
 */
const SECRET_PATTERN = /\b(sk|sk-proj|sk-or-v1|AIza|ntn|secret)[-_A-Za-z0-9]{8,}/g

export function maskSecrets(text: string): string {
  return text.replace(SECRET_PATTERN, "***")
}

export class ProviderConfigError extends Error {
  readonly issues: readonly ConfigIssue[]

  constructor(providerLabel: string, issues: readonly ConfigIssue[]) {
    const masked = issues.map((issue) => ({
      field: issue.field,
      message: maskSecrets(issue.message)
    }))
    // Field keys stay as identifiers: they are what the options page labels its inputs with.
    super(
      t("errorProviderConfigIncomplete", {
        label: providerLabel,
        issues: joinList(masked.map((issue) => `${issue.field} — ${issue.message}`))
      })
    )
    this.name = "ProviderConfigError"
    this.issues = masked
  }
}

export class UnknownProviderError extends Error {
  constructor(kind: string, id: string, known: readonly string[]) {
    super(t("errorProviderNotFound", { kind, id, known: joinList(known) }))
    this.name = "UnknownProviderError"
  }
}

/** The public face every provider shares; capability-specific methods extend it. */
export interface ProviderDescriptor {
  readonly id: string
  readonly label: string
  readonly fields: readonly ConfigField[]
  readonly docsUrl?: string
  /**
   * Empty array means the values are usable. Messages are shown to the user, so they must
   * describe the problem without quoting the offending value.
   */
  validate(values: ConfigValues): readonly ConfigIssue[]
  /**
   * Match patterns this provider needs to reach its API. Declared here so the options page
   * can request them at configuration time instead of the manifest asking for every
   * provider's host up front. A pattern derived from user input (a custom baseUrl) is
   * returned by `hostsFor`.
   */
  hostsFor(values: ConfigValues): readonly string[]
}
