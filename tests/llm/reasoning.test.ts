import { describe, expect, test } from "vitest"

import type { ConfigValues } from "~/core/provider/descriptor"
import { REASONING_FIELD, reasoningEffortOf } from "~/llm/config"
import { geminiDescriptor } from "~/llm/providers/gemini"
import { openAiDescriptor } from "~/llm/providers/openai"
import { openRouterDescriptor } from "~/llm/providers/openrouter"

const DESCRIPTORS = [openRouterDescriptor, openAiDescriptor, geminiDescriptor]

const withEffort = (effort: string): ConfigValues => ({ [REASONING_FIELD]: effort })

describe("reasoningEffortOf", () => {
  test("reads the three levels the select offers", () => {
    expect(reasoningEffortOf(withEffort("low"))).toBe("low")
    expect(reasoningEffortOf(withEffort("medium"))).toBe("medium")
    expect(reasoningEffortOf(withEffort("high"))).toBe("high")
  })

  test("treats an unset or unrecognised level as no preference", () => {
    // A value outside the select comes from another build of the extension. Passing it
    // through would reach the API and be rejected there, where the user cannot see why.
    expect(reasoningEffortOf({})).toBeNull()
    expect(reasoningEffortOf(withEffort(""))).toBeNull()
    expect(reasoningEffortOf(withEffort("maximum"))).toBeNull()
  })
})

describe("providerOptionsFor", () => {
  test("every LLM provider offers the reasoning field", () => {
    // The field lives in the shared `llmFields`, so a provider that stops using it would
    // silently drop the setting from its form while still reading the stored value.
    for (const descriptor of DESCRIPTORS) {
      const field = descriptor.fields.find((candidate) => candidate.key === REASONING_FIELD)
      expect(field?.kind).toBe("select")
      expect(field?.options?.map((option) => option.value)).toEqual([
        "low",
        "medium",
        "high"
      ])
    }
  })

  test("sends nothing at all when no level is chosen", () => {
    // An empty options object is not the same as none: a model with no reasoning support
    // must see a request identical to the one it got before this setting existed.
    for (const descriptor of DESCRIPTORS) {
      expect(descriptor.providerOptionsFor({})).toBeUndefined()
    }
  })

  test("maps the level onto each SDK's own spelling", () => {
    expect(openRouterDescriptor.providerOptionsFor(withEffort("high"))).toEqual({
      openrouter: { reasoning: { effort: "high" } }
    })
    expect(openAiDescriptor.providerOptionsFor(withEffort("low"))).toEqual({
      openai: { reasoningEffort: "low" }
    })
    expect(geminiDescriptor.providerOptionsFor(withEffort("medium"))).toEqual({
      google: { thinkingConfig: { thinkingLevel: "medium" } }
    })
  })
})
