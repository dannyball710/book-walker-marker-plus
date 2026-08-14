import { createOpenAI } from "@ai-sdk/openai"
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

const ID = "openai"
const LABEL = "OpenAI"
const DEFAULT_BASE_URL = "https://api.openai.com/v1"

const fields = llmFields({
  keyLabel: "API key",
  keyPlaceholder: "sk-…",
  keyHelp: t("llmKeyHelpLocalOnly"),
  modelPlaceholder: "gpt-4o-mini",
  defaultBaseUrl: DEFAULT_BASE_URL
})

const codec = llmConfigCodec(LABEL, fields)

const endpointOf = (values: ConfigValues): string =>
  resolveBaseUrl(baseUrlOf(values), DEFAULT_BASE_URL)

export const openAiDescriptor: LlmProviderDescriptor = {
  id: ID,
  label: LABEL,
  fields,
  docsUrl: "https://platform.openai.com/api-keys",

  modelField: MODEL_FIELD,
  validate: (values) => codec.validate(values),
  hostsFor: (values) => hostPatternsFor(values, DEFAULT_BASE_URL),
  providerOptionsFor: (values) =>
    reasoningOptionsFor(values, (effort) => ({ openai: { reasoningEffort: effort } })),

  listModels(values) {
    return fetchModelIds({
      providerId: ID,
      url: `${endpointOf(values)}/models`,
      headers: { Authorization: `Bearer ${apiKeyOf(values)}` },
      parse: (json) => parseOpenAiStyleModels(ID, json)
    })
  },

  // chat completions rather than the responses API: OpenAI-compatible endpoints only speak the former
  createModel(values): LanguageModel {
    const config = codec.parse(values)
    return createOpenAI({
      apiKey: config.apiKey,
      baseURL: endpointOf(values)
    }).chat(config.model)
  }
}
