import { createGoogleGenerativeAI } from "@ai-sdk/google"
import type { LanguageModel } from "ai"

import type { ConfigValues } from "~/core/provider/descriptor"
import { t } from "~/core/i18n"
import {
  apiKeyOf,
  baseUrlOf,
  hostPatternsFor,
  llmConfigCodec,
  llmFields,
  MODEL_FIELD,
  reasoningOptionsFor
} from "~/llm/config"
import { fetchModelIds, parseGeminiModels, resolveBaseUrl } from "~/llm/model-list"
import type { LlmProviderDescriptor } from "~/llm/provider"

const ID = "gemini"
const LABEL = "Gemini"
const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"

const fields = llmFields({
  keyLabel: "API key",
  keyPlaceholder: "AIza…",
  keyHelp: t("llmKeyHelpGemini"),
  modelPlaceholder: "gemini-2.5-flash",
  defaultBaseUrl: DEFAULT_BASE_URL
})

const codec = llmConfigCodec(LABEL, fields)

const endpointOf = (values: ConfigValues): string =>
  resolveBaseUrl(baseUrlOf(values), DEFAULT_BASE_URL)

/** The API names models `models/gemini-…`; the SDK wants the bare id, and users paste both. */
export function bareModelId(model: string): string {
  return model.replace(/^models\//, "")
}

export const geminiDescriptor: LlmProviderDescriptor = {
  id: ID,
  label: LABEL,
  fields,
  docsUrl: "https://aistudio.google.com/apikey",

  modelField: MODEL_FIELD,
  validate: (values) => codec.validate(values),
  hostsFor: (values) => hostPatternsFor(values, DEFAULT_BASE_URL),
  // Gemini spends a thinking budget rather than an effort level; `thinkingLevel` is the
  // SDK's own mapping of the three levels onto that budget.
  providerOptionsFor: (values) =>
    reasoningOptionsFor(values, (effort) => ({
      google: { thinkingConfig: { thinkingLevel: effort } }
    })),

  listModels(values) {
    return fetchModelIds({
      providerId: ID,
      url: `${endpointOf(values)}/models`,
      // header form, so the key never lands in a URL that could be logged
      headers: { "x-goog-api-key": apiKeyOf(values) },
      parse: parseGeminiModels
    })
  },

  createModel(values): LanguageModel {
    const config = codec.parse(values)
    return createGoogleGenerativeAI({
      apiKey: config.apiKey,
      baseURL: endpointOf(values)
    }).chat(bareModelId(config.model))
  }
}
