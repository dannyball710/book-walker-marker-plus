/**
 * Default settings and a lenient parser: a corrupted field falls back to its
 * default rather than throwing, so a bad write can never lock the user out of
 * the options page.
 *
 * Structural only. It must not import the provider registries — it runs in every
 * context, and the LLM registry pulls in the ai sdk. An `active` id no registry
 * knows is therefore a use-site error, not a parse error.
 */
import * as z from "zod"

import { t } from "~/core/i18n"

import type {
  AppSettings,
  ProviderConfigEntry,
  ProviderSelection,
  PromptPreset
} from "./types"

export const DEFAULT_SETTINGS: AppSettings = {
  storage: { active: "idb", configs: [] },
  llm: { active: "openrouter", configs: [] },
  prompts: [
    {
      id: "translate",
      label: t("promptPresetTranslateLabel"),
      template: t("promptPresetTranslateTemplate"),
      order: 0
    },
    {
      id: "grammar",
      label: t("promptPresetGrammarLabel"),
      template: t("promptPresetGrammarTemplate"),
      order: 1
    },
    {
      id: "reading",
      label: t("promptPresetReadingLabel"),
      template: t("promptPresetReadingTemplate"),
      order: 2
    }
  ]
}

/**
 * Recovers element by element: one unreadable entry must not cost the user every
 * API key or every custom preset. Only a value that is not an array at all falls
 * back wholesale, because then there is nothing to salvage.
 */
function lenientArray<T>(element: z.ZodType<T>, fallback: readonly T[]) {
  return z
    .array(z.unknown())
    .transform((rows) => {
      const kept: T[] = []
      for (const row of rows) {
        const parsed = element.safeParse(row)
        if (parsed.success) {
          kept.push(parsed.data)
        }
      }
      return kept
    })
    .catch([...fallback])
}

const configValuesSchema = z.record(z.string(), z.string())

const providerConfigSchema: z.ZodType<ProviderConfigEntry> = z.object({
  providerId: z.string(),
  values: configValuesSchema
})

function providerSelection(fallback: ProviderSelection) {
  return z
    .object({
      active: z.string(),
      configs: lenientArray(providerConfigSchema, fallback.configs)
    })
    .catch({ active: fallback.active, configs: [...fallback.configs] })
}

const promptSchema: z.ZodType<PromptPreset> = z.object({
  id: z.string(),
  label: z.string(),
  template: z.string(),
  order: z.number()
})

const settingsSchema = z.object({
  storage: providerSelection(DEFAULT_SETTINGS.storage),
  llm: providerSelection(DEFAULT_SETTINGS.llm),
  prompts: lenientArray(promptSchema, DEFAULT_SETTINGS.prompts)
})

export function parseSettings(json: unknown): AppSettings {
  const result = settingsSchema.safeParse(json)
  if (!result.success) {
    return DEFAULT_SETTINGS
  }
  return result.data
}
