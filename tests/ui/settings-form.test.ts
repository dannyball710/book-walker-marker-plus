import { describe, expect, it } from "vitest"

import type { ProviderCatalogEntry } from "~/core/messaging/protocol"
import type { ConfigField } from "~/core/provider/descriptor"
import type { AppSettings, ProviderSelection } from "~/core/settings/types"
import {
  activeEntry,
  catalogFor,
  missingRequiredFields,
  normalizeSettings,
  setActiveProvider,
  setConfigValue,
  valueOf
} from "~/ui/logic/settings-form"

const patField: ConfigField = {
  key: "pat",
  label: "Integration Token",
  kind: "secret",
  required: true
}
const dbField: ConfigField = {
  key: "databaseId",
  label: "Database ID",
  kind: "text",
  required: true
}
const apiKeyField: ConfigField = {
  key: "apiKey",
  label: "API key",
  kind: "secret",
  required: true
}

const catalog: readonly ProviderCatalogEntry[] = [
  { kind: "storage", id: "idb", label: "This device", fields: [], hosts: [] },
  {
    kind: "storage",
    id: "notion",
    label: "Notion",
    fields: [patField, dbField],
    hosts: ["https://api.notion.com/*"]
  },
  {
    kind: "llm",
    id: "openrouter",
    label: "OpenRouter",
    fields: [apiKeyField],
    modelField: "model",
    hosts: ["https://openrouter.ai/*"]
  }
]

const notionSelection: ProviderSelection = {
  active: "notion",
  configs: [
    { providerId: "notion", values: { pat: "ntn_secret", databaseId: "db-1" } },
    { providerId: "idb", values: {} }
  ]
}

describe("catalogFor", () => {
  it("splits the single catalog into the two form sections", () => {
    expect(catalogFor(catalog, "storage").map((e) => e.id)).toEqual(["idb", "notion"])
    expect(catalogFor(catalog, "llm").map((e) => e.id)).toEqual(["openrouter"])
  })
})

describe("setActiveProvider", () => {
  it("switches the active id without touching any stored credentials", () => {
    const next = setActiveProvider(notionSelection, "idb")
    expect(next.active).toBe("idb")
    expect(next.configs).toEqual(notionSelection.configs)
  })
})

describe("setConfigValue", () => {
  it("patches one field and leaves the provider's other fields alone", () => {
    const next = setConfigValue(notionSelection, "notion", "databaseId", "db-2")
    expect(valueOf(next, "notion", dbField)).toBe("db-2")
    expect(valueOf(next, "notion", patField)).toBe("ntn_secret")
  })

  it("creates the entry when the provider has no config yet", () => {
    const empty: ProviderSelection = { active: "openrouter", configs: [] }
    const next = setConfigValue(empty, "openrouter", "apiKey", "sk-1")
    expect(valueOf(next, "openrouter", apiKeyField)).toBe("sk-1")
  })

  it("does not disturb other providers", () => {
    const next = setConfigValue(notionSelection, "idb", "anything", "x")
    expect(valueOf(next, "notion", patField)).toBe("ntn_secret")
  })
})

describe("valueOf", () => {
  it("reports an unset field as an empty string so inputs stay controlled", () => {
    expect(valueOf({ active: "notion", configs: [] }, "notion", patField)).toBe("")
  })
})

describe("normalizeSettings", () => {
  const settings: AppSettings = {
    storage: notionSelection,
    llm: {
      active: "openrouter",
      configs: [{ providerId: "openrouter", values: { apiKey: " sk-1\n" } }]
    },
    responseLanguage: " English ",
    prompts: [
      { id: "p1", label: "Translate", template: "{{text}}", order: 5 },
      { id: "p2", label: "  ", template: "  ", order: 6 }
    ]
  }

  it("trims values so a pasted trailing newline cannot break auth", () => {
    const result = normalizeSettings(settings, catalog)
    expect(result.llm.configs[0]?.values).toEqual({ apiKey: "sk-1" })
    expect(result.responseLanguage).toBe("English")
  })

  it("restores the i18n default when the response language is blank", () => {
    expect(
      normalizeSettings({ ...settings, responseLanguage: "   " }, catalog)
        .responseLanguage
    ).toBe("English")
  })

  it("keeps the inactive provider's credentials, so switching back needs no retyping", () => {
    const idb = normalizeSettings(
      { ...settings, storage: setActiveProvider(notionSelection, "idb") },
      catalog
    )
    expect(valueOf(idb.storage, "notion", patField)).toBe("ntn_secret")
  })

  it("drops configs for providers this build does not know about", () => {
    const stale: AppSettings = {
      ...settings,
      storage: {
        active: "notion",
        configs: [
          ...notionSelection.configs,
          { providerId: "dropbox", values: { token: "t" } }
        ]
      }
    }
    expect(
      normalizeSettings(stale, catalog).storage.configs.map((c) => c.providerId)
    ).toEqual(["notion", "idb"])
  })

  it("discards presets the user emptied out and renumbers the rest", () => {
    expect(normalizeSettings(settings, catalog).prompts).toEqual([
      { id: "p1", label: "Translate", template: "{{text}}", order: 0 }
    ])
  })
})

describe("missingRequiredFields", () => {
  it("names every blank required field of the active provider", () => {
    const notion = catalog[1]
    if (notion === undefined) {
      throw new Error("fixture missing")
    }
    const blank: ProviderSelection = { active: "notion", configs: [] }
    expect(missingRequiredFields(blank, notion).map((f) => f.key)).toEqual([
      "pat",
      "databaseId"
    ])
    expect(missingRequiredFields(notionSelection, notion)).toEqual([])
  })
})

describe("activeEntry", () => {
  it("returns null when the stored provider id is no longer offered", () => {
    const gone: ProviderSelection = { active: "dropbox", configs: [] }
    expect(activeEntry(gone, catalogFor(catalog, "storage"))).toBeNull()
  })
})
