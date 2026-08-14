import { beforeEach, describe, expect, it, vi } from "vitest"

import { parseGeminiModels, parseOpenAiStyleModels, resolveBaseUrl } from "~/llm/model-list"
import { bareModelId } from "~/llm/providers/gemini"

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined)
})

describe("parseOpenAiStyleModels", () => {
  it("extracts the model ids", () => {
    expect(
      parseOpenAiStyleModels("openai", {
        data: [{ id: "gpt-4o-mini", object: "model" }, { id: "gpt-4o" }]
      })
    ).toEqual(["gpt-4o-mini", "gpt-4o"])
  })

  it.each([
    ["a provider error object", { error: { message: "invalid api key" } }],
    ["an id of the wrong type", { data: [{ id: 42 }] }],
    ["an HTML error page parsed as text", "<html>502</html>"],
    ["null", null]
  ])("degrades to an empty list instead of throwing on %s", (_label, payload) => {
    expect(parseOpenAiStyleModels("openrouter", payload)).toEqual([])
  })

  it("reports why the list is empty rather than failing silently", () => {
    parseOpenAiStyleModels("openrouter", { unexpected: true })
    expect(console.warn).toHaveBeenCalled()
  })
})

describe("parseGeminiModels", () => {
  it("strips the models/ prefix so the id matches what createModel expects", () => {
    expect(
      parseGeminiModels({
        models: [
          { name: "models/gemini-2.0-flash", supportedGenerationMethods: ["generateContent"] }
        ]
      })
    ).toEqual(["gemini-2.0-flash"])
  })

  it("drops models that cannot answer a chat request", () => {
    expect(
      parseGeminiModels({
        models: [
          { name: "models/text-embedding-004", supportedGenerationMethods: ["embedContent"] },
          { name: "models/gemini-2.0-flash", supportedGenerationMethods: ["generateContent"] }
        ]
      })
    ).toEqual(["gemini-2.0-flash"])
  })

  it("degrades to an empty list on a malformed payload", () => {
    expect(parseGeminiModels({ models: "nope" })).toEqual([])
  })
})

describe("resolveBaseUrl", () => {
  it("falls back when the user left the custom endpoint blank", () => {
    expect(resolveBaseUrl(undefined, "https://api.openai.com/v1")).toBe("https://api.openai.com/v1")
    expect(resolveBaseUrl("   ", "https://api.openai.com/v1")).toBe("https://api.openai.com/v1")
  })

  it("trims a trailing slash so the endpoint path stays well formed", () => {
    expect(resolveBaseUrl("https://proxy.local/v1/", "https://api.openai.com/v1")).toBe(
      "https://proxy.local/v1"
    )
  })
})

describe("gemini model ids", () => {
  it("accepts the prefixed name the API returns as well as the bare id the SDK wants", () => {
    expect(bareModelId("models/gemini-2.5-flash")).toBe("gemini-2.5-flash")
    expect(bareModelId("gemini-2.5-flash")).toBe("gemini-2.5-flash")
  })
})
