import type { ConfigValues } from "~/core/provider/descriptor"
import { ProviderConfigError } from "~/core/provider/descriptor"
import { createRegistry } from "~/core/provider/registry"
import type { AppSettings } from "~/core/settings/types"
import { findProviderConfig } from "~/core/settings/types"
import type { LlmProviderDescriptor } from "~/llm/provider"
import { geminiDescriptor } from "~/llm/providers/gemini"
import { openAiDescriptor } from "~/llm/providers/openai"
import { openRouterDescriptor } from "~/llm/providers/openrouter"

/** Registration order is display order; adding a provider means one more line here. */
export const llmRegistry = createRegistry<LlmProviderDescriptor>("llm")

llmRegistry.register(openRouterDescriptor)
llmRegistry.register(openAiDescriptor)
llmRegistry.register(geminiDescriptor)

export interface ActiveLlm {
  readonly descriptor: LlmProviderDescriptor
  readonly values: ConfigValues
}

/**
 * Throws UnknownProviderError / ProviderConfigError. Both are written for the user,
 * and the "what is missing" wording comes from the descriptor's field metadata
 * rather than from per-provider strings.
 */
export function resolveActiveLlm(settings: AppSettings): ActiveLlm {
  const descriptor = llmRegistry.get(settings.llm.active)
  const values = findProviderConfig(settings.llm, descriptor.id)

  const issues = descriptor.validate(values)
  if (issues.length > 0) {
    throw new ProviderConfigError(descriptor.label, issues)
  }
  return { descriptor, values }
}
