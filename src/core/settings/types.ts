import type { ConfigValues } from "~/core/provider/descriptor"

export interface ProviderConfigEntry {
  readonly providerId: string
  readonly values: ConfigValues
}

/**
 * Provider-agnostic on purpose: a new storage or LLM backend must not require a new
 * settings field. The active id is validated against the registry, not against a union.
 */
export interface ProviderSelection {
  readonly active: string
  readonly configs: readonly ProviderConfigEntry[]
}

export interface PromptPreset {
  readonly id: string
  readonly label: string
  /** supports {{text}} / {{memo}} / {{bookTitle}} placeholders */
  readonly template: string
  readonly order: number
}

export interface AppSettings {
  readonly storage: ProviderSelection
  readonly llm: ProviderSelection
  readonly prompts: readonly PromptPreset[]
}

export function findProviderConfig(
  selection: ProviderSelection,
  providerId: string
): ConfigValues {
  return (
    selection.configs.find((entry) => entry.providerId === providerId)?.values ?? {}
  )
}

export function withProviderConfig(
  selection: ProviderSelection,
  providerId: string,
  values: ConfigValues
): ProviderSelection {
  const others = selection.configs.filter((entry) => entry.providerId !== providerId)
  return { ...selection, configs: [...others, { providerId, values }] }
}
