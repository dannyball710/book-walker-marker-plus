import { createOpenRouter } from "@openrouter/ai-sdk-provider"
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
import { fetchModelIds, parseOpenAiStyleModels, resolveBaseUrl } from "~/llm/model-list"
import type { LlmProviderDescriptor } from "~/llm/provider"

const ID = "openrouter"
const LABEL = "OpenRouter"
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"

const fields = llmFields({
  keyLabel: "API key",
  keyPlaceholder: "sk-or-v1-…",
  keyHelp: t("llmKeyHelpLocalOnly"),
  modelPlaceholder: "google/gemini-2.5-flash",
  defaultBaseUrl: DEFAULT_BASE_URL
})

const codec = llmConfigCodec(LABEL, fields)

const endpointOf = (values: ConfigValues): string =>
  resolveBaseUrl(baseUrlOf(values), DEFAULT_BASE_URL)

export const openRouterDescriptor: LlmProviderDescriptor = {
  id: ID,
  label: LABEL,
  fields,
  docsUrl: "https://openrouter.ai/keys",

  modelField: MODEL_FIELD,
  validate: (values) => codec.validate(values),
  hostsFor: (values) => hostPatternsFor(values, DEFAULT_BASE_URL),
  providerOptionsFor: (values) =>
    reasoningOptionsFor(values, (effort) => ({
      openrouter: { reasoning: { effort } }
    })),

  listModels(values) {
    return fetchModelIds({
      providerId: ID,
      url: `${endpointOf(values)}/models`,
      headers: { Authorization: `Bearer ${apiKeyOf(values)}` },
      parse: (json) => parseOpenAiStyleModels(ID, json)
    })
  },

  createModel(values): LanguageModel {
    const config = codec.parse(values)
    return createOpenRouter({
      apiKey: config.apiKey,
      baseURL: endpointOf(values)
    }).chat(config.model)
  }
}
