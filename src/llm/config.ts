import type { ProviderOptions } from "@ai-sdk/provider-utils"
import * as z from "zod"

import { t } from "~/core/i18n"
import { createConfigCodec, type ConfigCodec } from "~/core/provider/config"
import type { ConfigField, ConfigValues } from "~/core/provider/descriptor"
import { resolveBaseUrl } from "~/llm/model-list"

/**
 * Shared shape of the three current providers. A provider is free to declare its
 * own fields and its own config type instead — nothing here is mandatory.
 */
export interface LlmConfig {
  readonly apiKey: string
  readonly model: string
  /** custom baseURL for OpenAI-compatible endpoints and proxies */
  readonly baseUrl?: string
}

export const MODEL_FIELD = "model"
export const REASONING_FIELD = "reasoningEffort"

export type ReasoningEffort = "low" | "medium" | "high"

const REASONING_EFFORTS: readonly ReasoningEffort[] = ["low", "medium", "high"]

const REASONING_OPTIONS = [
  { value: "low", label: t("llmReasoningLow") },
  { value: "medium", label: t("llmReasoningMedium") },
  { value: "high", label: t("llmReasoningHigh") }
]

export function llmFields(input: {
  readonly keyLabel: string
  readonly keyPlaceholder: string
  readonly keyHelp: string
  readonly modelPlaceholder: string
  readonly defaultBaseUrl: string
}): readonly ConfigField[] {
  return [
    {
      key: "apiKey",
      label: input.keyLabel,
      kind: "secret",
      required: true,
      placeholder: input.keyPlaceholder,
      help: input.keyHelp
    },
    {
      key: MODEL_FIELD,
      label: t("llmFieldModelLabel"),
      kind: "text",
      required: true,
      placeholder: input.modelPlaceholder,
      help: t("llmFieldModelHelp")
    },
    {
      key: REASONING_FIELD,
      label: t("llmFieldReasoningLabel"),
      kind: "select",
      required: false,
      options: REASONING_OPTIONS,
      help: t("llmFieldReasoningHelp")
    },
    {
      key: "baseUrl",
      label: t("llmFieldBaseUrlLabel"),
      kind: "url",
      required: false,
      placeholder: input.defaultBaseUrl,
      help: t("llmFieldBaseUrlHelp", { url: input.defaultBaseUrl })
    }
  ]
}

/**
 * Unset and unrecognised both mean "say nothing about reasoning": the stored value comes
 * from a select, so anything else is a setting written by an older or newer build, and
 * forwarding it would make the provider reject a request the user cannot debug.
 */
export function reasoningEffortOf(values: ConfigValues): ReasoningEffort | null {
  const stored = values[REASONING_FIELD]
  return REASONING_EFFORTS.find((effort) => effort === stored) ?? null
}

/**
 * Each provider spells the same three levels differently, so the shape is the caller's;
 * this only owns the rule that no reasoning setting means no `providerOptions` at all,
 * which is what keeps non-reasoning models working untouched.
 */
export function reasoningOptionsFor(
  values: ConfigValues,
  build: (effort: ReasoningEffort) => ProviderOptions
): ProviderOptions | undefined {
  const effort = reasoningEffortOf(values)
  return effort === null ? undefined : build(effort)
}

const optionalUrl = z
  .string()
  .trim()
  .refine((value) => value === "" || isAbsoluteUrl(value), {
    message: t("validationUrl")
  })
  .optional()

function isAbsoluteUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

export function llmConfigCodec(
  label: string,
  fields: readonly ConfigField[]
): ConfigCodec<LlmConfig> {
  return createConfigCodec<LlmConfig>({
    label,
    fields,
    schema: z
      .object({
        apiKey: z.string().trim().min(1, t("validationApiKey")),
        model: z.string().trim().min(1, t("validationModelId")),
        baseUrl: optionalUrl
      })
      .transform((raw): LlmConfig => ({
        apiKey: raw.apiKey,
        model: raw.model,
        ...(raw.baseUrl === undefined || raw.baseUrl === "" ? {} : { baseUrl: raw.baseUrl })
      }))
  })
}

/**
 * Listing models has to work before a model has been picked, so it reads the raw
 * values rather than the codec, which demands a complete configuration.
 */
export function apiKeyOf(values: ConfigValues): string {
  return values.apiKey ?? ""
}

export function baseUrlOf(values: ConfigValues): string | undefined {
  return values.baseUrl
}

/**
 * The match pattern this provider needs, derived from whichever endpoint it will
 * actually call — a custom `baseUrl` points somewhere else entirely, so asking for
 * the provider's own host would grant the wrong permission. A malformed value
 * yields nothing; the codec is what tells the user it is malformed.
 */
export function hostPatternsFor(
  values: ConfigValues,
  defaultBaseUrl: string
): readonly string[] {
  const endpoint = resolveBaseUrl(baseUrlOf(values), defaultBaseUrl)
  // `new URL("localhost:1234")` parses as a custom scheme rather than throwing,
  // so the protocol has to be checked instead of relying on the catch.
  if (!isAbsoluteUrl(endpoint)) {
    return []
  }
  return [`${new URL(endpoint).origin}/*`]
}
