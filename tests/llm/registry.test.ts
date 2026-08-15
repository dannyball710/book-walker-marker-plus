import { describe, expect, it } from "vitest"
import { z } from "zod"

import { createConfigCodec } from "~/core/provider/config"
import {
  ProviderConfigError,
  UnknownProviderError,
  type ConfigField,
  type ConfigValues
} from "~/core/provider/descriptor"
import type { AppSettings, ProviderConfigEntry } from "~/core/settings/types"
import type { LlmProviderDescriptor } from "~/llm"
import { llmRegistry, resolveActiveLlm } from "~/llm"

function settingsWith(
  active: string,
  configs: readonly ProviderConfigEntry[]
): AppSettings {
  return {
    storage: { active: "idb", configs: [] },
    llm: { active, configs },
    responseLanguage: "English",
    prompts: []
  }
}

const OPENAI_VALUES: ConfigValues = { apiKey: "sk-test", model: "gpt-4o-mini" }

/**
 * A provider invented entirely inside this test: it never appears in a union, a
 * switch or a settings schema. If registering it here is enough to make it work,
 * the "one file + one register line" promise holds.
 */
const dummyFields: readonly ConfigField[] = [
  { key: "token", label: "Token", kind: "secret", required: true },
  { key: "deployment", label: "Deployment", kind: "text", required: true }
]

const dummyCodec = createConfigCodec<{ token: string; deployment: string }>({
  label: "Dummy",
  fields: dummyFields,
  schema: z.object({ token: z.string(), deployment: z.string() })
})

const dummyDescriptor: LlmProviderDescriptor = {
  id: "dummy",
  label: "Dummy",
  fields: dummyFields,
  modelField: "deployment",
  validate: (values) => dummyCodec.validate(values),
  hostsFor: () => ["https://dummy.example/*"],
  providerOptionsFor: () => undefined,
  createModel: () => "openai/gpt-4o-mini",
  listModels: () => Promise.resolve(["alpha", "beta"])
}

llmRegistry.register(dummyDescriptor)

describe("resolveActiveLlm", () => {
  it("returns the descriptor of the active provider together with its values", () => {
    const resolved = resolveActiveLlm(
      settingsWith("openai", [{ providerId: "openai", values: OPENAI_VALUES }])
    )
    expect(resolved.descriptor.id).toBe("openai")
    expect(resolved.values).toEqual(OPENAI_VALUES)
  })

  it("rejects an id nobody registered, naming the ones that exist", () => {
    expect(() => resolveActiveLlm(settingsWith("anthropic", []))).toThrow(UnknownProviderError)
    expect(() => resolveActiveLlm(settingsWith("anthropic", []))).toThrow(/openrouter/)
  })

  it("refuses to stream when the active provider was never configured", () => {
    expect(() => resolveActiveLlm(settingsWith("gemini", []))).toThrow(ProviderConfigError)
  })

  it("names the missing field instead of letting the request 401", () => {
    const settings = settingsWith("openai", [
      { providerId: "openai", values: { model: "gpt-4o-mini" } }
    ])
    expect(() => resolveActiveLlm(settings)).toThrow(/apiKey/)
  })

  it("refuses to stream before a model has been picked", () => {
    const settings = settingsWith("openai", [
      { providerId: "openai", values: { apiKey: "sk-test" } }
    ])
    expect(() => resolveActiveLlm(settings)).toThrow(/model/)
  })

  it("never leaks the API key into the error text", () => {
    const secret = "sk-super-secret-value"
    const settings = settingsWith("openai", [
      { providerId: "openai", values: { apiKey: secret } }
    ])

    try {
      resolveActiveLlm(settings)
      expect.unreachable("expected a throw")
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderConfigError)
      expect(error instanceof Error ? error.message : "").not.toContain(secret)
    }
  })

  it("ignores configs belonging to another provider", () => {
    const settings = settingsWith("openai", [
      { providerId: "gemini", values: { apiKey: "AIza-other", model: "gemini-2.5-flash" } },
      { providerId: "openai", values: OPENAI_VALUES }
    ])
    expect(resolveActiveLlm(settings).values).toEqual(OPENAI_VALUES)
  })

  it("serves a provider that only this test knows about, with no change anywhere else", () => {
    const settings = settingsWith("dummy", [
      { providerId: "dummy", values: { token: "t", deployment: "my-deployment" } }
    ])
    const resolved = resolveActiveLlm(settings)

    expect(resolved.descriptor.id).toBe("dummy")
    // the model id lives under a field name no shared code knows
    expect(resolved.values[resolved.descriptor.modelField]).toBe("my-deployment")
  })
})

describe("the LLM registry", () => {
  it.each(["openrouter", "openai", "gemini"])("offers %s", (id) => {
    expect(llmRegistry.get(id).id).toBe(id)
  })

  it("lists providers in registration order, which the options page uses as display order", () => {
    expect(llmRegistry.list().map((descriptor) => descriptor.id)).toEqual([
      "openrouter",
      "openai",
      "gemini",
      "dummy"
    ])
  })

  it("refuses a duplicate id rather than shadowing the first provider", () => {
    expect(() => llmRegistry.register(dummyDescriptor)).toThrow(/dummy/)
  })

  it("exposes everything the provider catalog projects to the options page", () => {
    for (const descriptor of llmRegistry.list()) {
      expect(descriptor.label.length).toBeGreaterThan(0)
      expect(descriptor.fields.length).toBeGreaterThan(0)
      expect(descriptor.fields.map((field) => field.key)).toContain(descriptor.modelField)
    }
  })

  it("keeps the api key a secret field, so the options form masks it", () => {
    for (const id of ["openrouter", "openai", "gemini"]) {
      const fields = llmRegistry.get(id).fields
      expect(fields.find((field) => field.key === "apiKey")?.kind).toBe("secret")
      expect(fields.find((field) => field.key === "baseUrl")?.required).toBe(false)
    }
  })
})

describe("provider config validation", () => {
  const openai = llmRegistry.get("openai")

  it("accepts a complete configuration", () => {
    expect(openai.validate(OPENAI_VALUES)).toEqual([])
  })

  it("reports each missing required field by key", () => {
    expect(openai.validate({}).map((issue) => issue.field)).toEqual(["apiKey", "model"])
  })

  it("treats a whitespace-only value as missing", () => {
    // By field, not by wording: the message is user-facing copy.
    expect(
      openai.validate({ apiKey: "   ", model: "gpt-4o-mini" }).map((issue) => issue.field)
    ).toEqual(["apiKey"])
  })

  it("rejects an endpoint that is not an absolute http(s) URL", () => {
    const issues = openai.validate({ ...OPENAI_VALUES, baseUrl: "localhost:1234" })
    expect(issues.map((issue) => issue.field)).toEqual(["baseUrl"])
  })

  it("accepts a blank endpoint, which means the provider default", () => {
    expect(openai.validate({ ...OPENAI_VALUES, baseUrl: "" })).toEqual([])
    expect(openai.validate({ ...OPENAI_VALUES, baseUrl: "https://proxy.local/v1" })).toEqual([])
  })
})

describe("hostsFor", () => {
  it("asks for the provider's own host when no custom endpoint is set", () => {
    expect(llmRegistry.get("openrouter").hostsFor({})).toEqual(["https://openrouter.ai/*"])
    expect(llmRegistry.get("openai").hostsFor({})).toEqual(["https://api.openai.com/*"])
  })

  it("drops the API path, because a match pattern is per origin", () => {
    expect(llmRegistry.get("gemini").hostsFor({})).toEqual([
      "https://generativelanguage.googleapis.com/*"
    ])
  })

  it("follows a custom endpoint, so the grant matches where the request actually goes", () => {
    expect(
      llmRegistry.get("openai").hostsFor({ baseUrl: "https://proxy.local:8443/v1" })
    ).toEqual(["https://proxy.local:8443/*"])
  })

  it("falls back to the default host when the endpoint field is blank", () => {
    expect(llmRegistry.get("openai").hostsFor({ baseUrl: "   " })).toEqual([
      "https://api.openai.com/*"
    ])
  })

  it("asks for nothing rather than throwing on a malformed endpoint", () => {
    expect(llmRegistry.get("openai").hostsFor({ baseUrl: "localhost:1234" })).toEqual([])
  })
})
