import { afterEach, describe, expect, test } from "vitest"

import { expandPrompt } from "~/core/prompt/expand"
import {
  createDefaultSettings,
  DEFAULT_SETTINGS,
  parseSettings
} from "~/core/settings/defaults"

afterEach(() => {
  Reflect.deleteProperty(globalThis, "chrome")
})

describe("DEFAULT_SETTINGS", () => {
  test("stores locally and talks to OpenRouter until the user configures otherwise", () => {
    expect(DEFAULT_SETTINGS.storage.active).toBe("idb")
    expect(DEFAULT_SETTINGS.storage.configs).toEqual([])
    expect(DEFAULT_SETTINGS.llm.active).toBe("openrouter")
    expect(DEFAULT_SETTINGS.llm.configs).toEqual([])
    expect(DEFAULT_SETTINGS.responseLanguage).toBe("English")
  })

  test("ships prompt presets that all reference the marker text", () => {
    expect(DEFAULT_SETTINGS.prompts.length).toBeGreaterThanOrEqual(2)
    for (const preset of DEFAULT_SETTINGS.prompts) {
      expect(preset.template).toContain("{{text}}")
      expect(preset.template).toContain("{{responseLanguage}}")
    }
  })

  test("takes the initial response language from chrome.i18n", () => {
    Reflect.set(globalThis, "chrome", {
      i18n: {
        getMessage(key: string) {
          return key === "assistantResponseLanguage" ? "日本語" : ""
        }
      }
    })

    expect(createDefaultSettings().responseLanguage).toBe("日本語")
  })

  test("preset placeholders all resolve, leaving nothing to expand", () => {
    for (const preset of DEFAULT_SETTINGS.prompts) {
      const expanded = expandPrompt(preset.template, {
        text: "テスト本文",
        memo: "note",
        bookTitle: "サンプル書籍",
        responseLanguage: "English"
      })
      expect(expanded).not.toMatch(/\{\{\s*[A-Za-z]+\s*\}\}/)
    }
  })

  test("preset order is unique so the UI can sort deterministically", () => {
    const orders = DEFAULT_SETTINGS.prompts.map((preset) => preset.order)
    expect(new Set(orders).size).toBe(orders.length)
  })
})

describe("parseSettings", () => {
  test("accepts what it produced itself", () => {
    expect(parseSettings(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS)
  })

  test("falls back wholesale when the stored value is not an object", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings("corrupted")).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings(undefined)).toEqual(DEFAULT_SETTINGS)
  })

  test("missing sections fall back individually", () => {
    const settings = parseSettings({ llm: { active: "openai", configs: [] } })
    expect(settings.storage).toEqual(DEFAULT_SETTINGS.storage)
    expect(settings.prompts).toEqual(DEFAULT_SETTINGS.prompts)
    expect(settings.llm.active).toBe("openai")
  })

  test("fills a missing or blank response language from the current locale", () => {
    const withoutLanguage = { ...DEFAULT_SETTINGS }
    Reflect.deleteProperty(withoutLanguage, "responseLanguage")

    expect(parseSettings(withoutLanguage).responseLanguage).toBe("English")
    expect(
      parseSettings({ ...DEFAULT_SETTINGS, responseLanguage: "   " })
        .responseLanguage
    ).toBe("English")
    expect(
      parseSettings({ ...DEFAULT_SETTINGS, responseLanguage: " Deutsch " })
        .responseLanguage
    ).toBe("Deutsch")
  })

  test("keeps an unknown provider id: only a registry can judge it", () => {
    const settings = parseSettings({
      ...DEFAULT_SETTINGS,
      storage: { active: "dropbox", configs: [] }
    })
    expect(settings.storage.active).toBe("dropbox")
  })

  test("keeps provider config values verbatim, whatever fields they hold", () => {
    const settings = parseSettings({
      ...DEFAULT_SETTINGS,
      storage: {
        active: "notion",
        configs: [
          { providerId: "notion", values: { pat: "secret", databaseId: "db" } }
        ]
      }
    })
    expect(settings.storage.configs).toEqual([
      { providerId: "notion", values: { pat: "secret", databaseId: "db" } }
    ])
  })

  test("keeps the configs of providers that are not active", () => {
    const settings = parseSettings({
      ...DEFAULT_SETTINGS,
      llm: {
        active: "openai",
        configs: [
          { providerId: "openai", values: { apiKey: "k" } },
          { providerId: "gemini", values: { apiKey: "k2" } }
        ]
      }
    })
    expect(settings.llm.configs.map((entry) => entry.providerId)).toEqual([
      "openai",
      "gemini"
    ])
  })

  test("a broken provider config costs only that entry, not every stored key", () => {
    const settings = parseSettings({
      ...DEFAULT_SETTINGS,
      llm: {
        active: "openai",
        configs: [
          { providerId: "openai", values: { apiKey: "k" } },
          { providerId: 42 },
          { providerId: "gemini", values: { apiKey: "k2" } }
        ]
      }
    })
    expect(settings.llm.configs.map((entry) => entry.providerId)).toEqual([
      "openai",
      "gemini"
    ])
  })

  test("rejects non-string config values rather than storing a number as a field", () => {
    const settings = parseSettings({
      ...DEFAULT_SETTINGS,
      llm: {
        active: "openai",
        configs: [{ providerId: "openai", values: { apiKey: 1 } }]
      }
    })
    expect(settings.llm.configs).toEqual([])
  })

  test("a broken preset costs only that preset, keeping the user's own ones", () => {
    const settings = parseSettings({
      ...DEFAULT_SETTINGS,
      prompts: [
        { id: "mine", label: "custom", template: "{{text}}", order: 0 },
        { id: 1 }
      ]
    })
    expect(settings.prompts).toEqual([
      { id: "mine", label: "custom", template: "{{text}}", order: 0 }
    ])
  })

  test("an empty preset list is honoured: the user may have deleted them all", () => {
    expect(parseSettings({ ...DEFAULT_SETTINGS, prompts: [] }).prompts).toEqual([])
  })

  test("only a non-array prompts value falls back to the shipped presets", () => {
    const settings = parseSettings({ ...DEFAULT_SETTINGS, prompts: "gone" })
    expect(settings.prompts).toEqual(DEFAULT_SETTINGS.prompts)
  })
})
