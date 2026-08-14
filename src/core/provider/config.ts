import type { ZodType } from "zod"

import { t } from "~/core/i18n"

import type {
  ConfigField,
  ConfigIssue,
  ConfigValues
} from "~/core/provider/descriptor"
import { ProviderConfigError } from "~/core/provider/descriptor"

export interface ConfigCodec<TConfig> {
  /** Throws ProviderConfigError; use inside a provider that already knows its label. */
  parse(values: ConfigValues): TConfig
  validate(values: ConfigValues): readonly ConfigIssue[]
}

type Outcome<TConfig> =
  | { readonly kind: "valid"; readonly config: TConfig }
  | { readonly kind: "invalid"; readonly issues: readonly ConfigIssue[] }

/**
 * Bridges the untyped form values to a provider's own config type. The zod schema is the
 * single source of truth for both the parsed shape and the messages shown per field.
 */
export function createConfigCodec<TConfig>(input: {
  readonly label: string
  readonly fields: readonly ConfigField[]
  readonly schema: ZodType<TConfig>
}): ConfigCodec<TConfig> {
  const evaluate = (values: ConfigValues): Outcome<TConfig> => {
    // Runs unconditionally: a whitespace-only value satisfies a `min(1)` schema but is not
    // a filled-in field. Both signals are collected so the user sees every problem at once.
    const missing = input.fields
      .filter((field) => field.required && (values[field.key] ?? "").trim() === "")
      .map((field) => ({ field: field.key, message: t("validationRequired") }))

    const result = input.schema.safeParse(values)
    if (result.success && missing.length === 0) {
      return { kind: "valid", config: result.data }
    }

    const fromSchema = result.success
      ? []
      : result.error.issues
          .map((issue) => ({
            field: issue.path.map(String).join(".") || "config",
            message: issue.message
          }))
          .filter((issue) => !missing.some((blank) => blank.field === issue.field))

    return { kind: "invalid", issues: [...missing, ...fromSchema] }
  }

  return {
    validate(values) {
      const outcome = evaluate(values)
      return outcome.kind === "valid" ? [] : outcome.issues
    },
    parse(values) {
      const outcome = evaluate(values)
      if (outcome.kind === "invalid") {
        throw new ProviderConfigError(input.label, outcome.issues)
      }
      return outcome.config
    }
  }
}

/**
 * Stable key for caching provider instances built from the same credentials. It contains
 * secrets in plain text, so it may only ever be used as a map key — never logged.
 */
export function configFingerprint(id: string, values: ConfigValues): string {
  const entries = Object.keys(values)
    .sort()
    .map((key) => [key, values[key] ?? ""])
  return `${id}::${JSON.stringify(entries)}`
}
