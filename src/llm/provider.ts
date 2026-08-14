import type { ProviderOptions } from "@ai-sdk/provider-utils"
import type { LanguageModel } from "ai"

import type { ConfigValues, ProviderDescriptor } from "~/core/provider/descriptor"

export interface LlmProviderDescriptor extends ProviderDescriptor {
  /** which field holds the model id, so the options page can offer completion */
  readonly modelField: string
  /** throws ProviderConfigError when the values are unusable */
  createModel(values: ConfigValues): LanguageModel
  /**
   * Per-request options for `streamText`, under the SDK's namespace for this provider.
   * Separate from `createModel` because the model instance is per configuration while
   * these are per call, and `undefined` has to stay possible: sending an empty options
   * object is not the same as sending none for providers that validate it.
   */
  providerOptionsFor(values: ConfigValues): ProviderOptions | undefined
  /** offered in the UI; returns an empty array on failure instead of throwing */
  listModels(values: ConfigValues): Promise<readonly string[]>
}
