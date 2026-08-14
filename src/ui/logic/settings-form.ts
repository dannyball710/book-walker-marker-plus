import type { ConfigField, ConfigValues } from "~/core/provider/descriptor"
import type { ProviderCatalogEntry } from "~/core/messaging/protocol"
import type { AppSettings, ProviderSelection } from "~/core/settings/types"
import { withProviderConfig } from "~/core/settings/types"

import { normalizeOrder } from "./prompts"

export function setActiveProvider(
  selection: ProviderSelection,
  providerId: string
): ProviderSelection {
  return { ...selection, active: providerId }
}

export function setConfigValue(
  selection: ProviderSelection,
  providerId: string,
  key: string,
  value: string
): ProviderSelection {
  const current =
    selection.configs.find((entry) => entry.providerId === providerId)?.values ?? {}
  return withProviderConfig(selection, providerId, { ...current, [key]: value })
}

export function catalogFor(
  catalog: readonly ProviderCatalogEntry[],
  kind: ProviderCatalogEntry["kind"]
): readonly ProviderCatalogEntry[] {
  return catalog.filter((entry) => entry.kind === kind)
}

function trimValues(values: ConfigValues): ConfigValues {
  const trimmed: { [key: string]: string } = {}
  for (const [key, value] of Object.entries(values)) {
    trimmed[key] = value.trim()
  }
  return trimmed
}

/**
 * Drops configs for providers the running build does not know about; keeps every known
 * one, so switching provider never discards the credentials of the other.
 */
function normalizeSelection(
  selection: ProviderSelection,
  entries: readonly ProviderCatalogEntry[]
): ProviderSelection {
  const known = new Set(entries.map((entry) => entry.id))
  return {
    active: selection.active,
    configs: selection.configs
      .filter((entry) => known.has(entry.providerId))
      .map((entry) => ({ providerId: entry.providerId, values: trimValues(entry.values) }))
  }
}

export function normalizeSettings(
  settings: AppSettings,
  catalog: readonly ProviderCatalogEntry[]
): AppSettings {
  return {
    storage: normalizeSelection(settings.storage, catalogFor(catalog, "storage")),
    llm: normalizeSelection(settings.llm, catalogFor(catalog, "llm")),
    prompts: normalizeOrder(
      settings.prompts.filter(
        (preset) => preset.label.trim() !== "" || preset.template.trim() !== ""
      )
    )
  }
}

export function valueOf(
  selection: ProviderSelection,
  providerId: string,
  field: ConfigField
): string {
  const values = selection.configs.find(
    (entry) => entry.providerId === providerId
  )?.values
  return values?.[field.key] ?? ""
}

/**
 * Cheap client-side check so the user sees a blank required field before saving.
 * Background still runs the real validation, which is the authority.
 */
export function missingRequiredFields(
  selection: ProviderSelection,
  entry: ProviderCatalogEntry
): readonly ConfigField[] {
  return entry.fields.filter(
    (field) => field.required && valueOf(selection, entry.id, field) === ""
  )
}

export function activeEntry(
  selection: ProviderSelection,
  entries: readonly ProviderCatalogEntry[]
): ProviderCatalogEntry | null {
  return entries.find((entry) => entry.id === selection.active) ?? null
}
