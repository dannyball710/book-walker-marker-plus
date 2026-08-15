import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type {
  ProviderCatalogResponse,
  ProviderHostsResponse,
  SettingsSetResponse
} from "~/core/messaging/protocol"
import { DEFAULT_SETTINGS } from "~/core/settings/defaults"
import type { AppSettings } from "~/core/settings/types"
import {
  CID,
  deleteDatabase,
  expectOk,
  invoke,
  stubChrome,
  type BgResponse,
  type ChromeSpy
} from "./harness"

const NOTION_PAT = "ntn_super_secret_value"

function settingsWith(storage: AppSettings["storage"]): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    storage,
    llm: {
      active: "openrouter",
      configs: [
        {
          providerId: "openrouter",
          values: { apiKey: "sk-or-v1-test", model: "google/gemini-2.5-flash" }
        }
      ]
    }
  }
}

async function loadHandlers() {
  vi.resetModules()
  const [
    settingsGet,
    settingsSet,
    providerCatalog,
    providerHosts,
    markerList
  ] = await Promise.all([
    import("~/background/messages/settings-get"),
    import("~/background/messages/settings-set"),
    import("~/background/messages/provider-catalog"),
    import("~/background/messages/provider-hosts"),
    import("~/background/messages/marker-list")
  ])
  const schema = await import("~/storage/providers/idb/schema")
  return {
    close: async () => (await schema.openBwmDb()).close(),
    settingsGet: settingsGet.default,
    settingsSet: settingsSet.default,
    providerCatalog: providerCatalog.default,
    providerHosts: providerHosts.default,
    markerList: markerList.default
  }
}

let handlers: Awaited<ReturnType<typeof loadHandlers>>
let spy: ChromeSpy

beforeEach(async () => {
  await deleteDatabase()
  spy = stubChrome()
  handlers = await loadHandlers()
})

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await handlers.close()
  vi.unstubAllGlobals()
  await deleteDatabase()
})

describe("settings", () => {
  it("serves the defaults before anything was ever saved", async () => {
    const response = await invoke(handlers.settingsGet, { name: "settings-get" })

    expect(expectOk(response).settings).toEqual(DEFAULT_SETTINGS)
  })

  it("persists a configuration both providers accept", async () => {
    const settings: AppSettings = {
      ...settingsWith({
        active: "notion",
        configs: [
          {
            providerId: "notion",
            values: { pat: NOTION_PAT, databaseId: "db-1" }
          }
        ]
      }),
      responseLanguage: "Brazilian Portuguese"
    }

    const saved: BgResponse<SettingsSetResponse> = await invoke(
      handlers.settingsSet,
      { name: "settings-set", body: { settings } }
    )

    expect(expectOk(saved)).toEqual({ saved: true, storage: [], llm: [] })
    const reread = await invoke(handlers.settingsGet, { name: "settings-get" })
    expect(expectOk(reread).settings).toEqual(settings)
  })

  it("stores nothing when the active store is incomplete", async () => {
    const settings = settingsWith({
      active: "notion",
      configs: [{ providerId: "notion", values: { pat: NOTION_PAT } }]
    })

    const saved: BgResponse<SettingsSetResponse> = await invoke(
      handlers.settingsSet,
      { name: "settings-set", body: { settings } }
    )
    const outcome = expectOk(saved)

    expect(outcome.saved).toBe(false)
    expect(outcome.storage.map((issue) => issue.field)).toEqual(["databaseId"])
    // rejected, not persisted: stored settings must never describe an unbuildable store
    const reread = await invoke(handlers.settingsGet, { name: "settings-get" })
    expect(expectOk(reread).settings).toEqual(DEFAULT_SETTINGS)
  })

  it("never puts a credential in the issues it reports back", async () => {
    const settings = settingsWith({
      active: "notion",
      configs: [{ providerId: "notion", values: { pat: NOTION_PAT } }]
    })

    const saved = await invoke(handlers.settingsSet, {
      name: "settings-set",
      body: { settings }
    })

    expect(JSON.stringify(saved)).not.toContain(NOTION_PAT)
  })

  it("saves an unrelated edit before the LLM is configured, reporting it as advisory", async () => {
    // A first-run user editing only a prompt must not be held hostage to an API key:
    // the model is not needed until they chat, and resolveActiveLlm fails legibly there.
    const settings: AppSettings = {
      ...DEFAULT_SETTINGS,
      prompts: [{ id: "p1", label: "Translate", template: "{{text}}", order: 0 }]
    }

    const saved: BgResponse<SettingsSetResponse> = await invoke(
      handlers.settingsSet,
      { name: "settings-set", body: { settings } }
    )
    const outcome = expectOk(saved)

    expect(outcome.saved).toBe(true)
    expect(outcome.storage).toEqual([])
    expect(outcome.llm.map((issue) => issue.field)).toEqual(["apiKey", "model"])
    const reread = await invoke(handlers.settingsGet, { name: "settings-get" })
    expect(expectOk(reread).settings).toEqual(settings)
  })

  it("reports an unregistered provider against the section it belongs to", async () => {
    const settings = settingsWith({ active: "dropbox", configs: [] })

    const saved: BgResponse<SettingsSetResponse> = await invoke(
      handlers.settingsSet,
      { name: "settings-set", body: { settings } }
    )

    const outcome = expectOk(saved)
    expect(outcome.saved).toBe(false)
    expect(outcome.storage.map((issue) => issue.field)).toEqual(["active"])
  })
})

describe("the provider catalog", () => {
  it("offers both kinds with the origins each needs at its default configuration", async () => {
    const response: BgResponse<ProviderCatalogResponse> = await invoke(
      handlers.providerCatalog,
      { name: "provider-catalog" }
    )
    const providers = expectOk(response).providers

    const idb = providers.find((entry) => entry.id === "idb")
    const notion = providers.find((entry) => entry.id === "notion")
    expect(idb?.kind).toBe("storage")
    expect(idb?.hosts).toEqual([])
    expect(notion?.hosts).toEqual(["https://api.notion.com/*"])
    // without this the options page cannot request a permission for a default endpoint
    expect(
      providers
        .filter((entry) => entry.kind === "llm")
        .every((entry) => entry.hosts.length > 0)
    ).toBe(true)
  })

  it("tells the options page which field holds the model id, for llm providers only", async () => {
    const response: BgResponse<ProviderCatalogResponse> = await invoke(
      handlers.providerCatalog,
      { name: "provider-catalog" }
    )
    const providers = expectOk(response).providers

    expect(
      providers.find((entry) => entry.id === "openrouter")?.modelField
    ).toBe("model")
    expect(providers.find((entry) => entry.id === "idb")?.modelField).toBeUndefined()
  })

  it("carries no functions, because a descriptor cannot cross a message boundary", async () => {
    const response = await invoke(handlers.providerCatalog, {
      name: "provider-catalog"
    })

    expect(() => structuredClone(response)).not.toThrow()
  })
})

describe("provider hosts", () => {
  it("answers for a storage provider", async () => {
    const response: BgResponse<ProviderHostsResponse> = await invoke(
      handlers.providerHosts,
      {
        name: "provider-hosts",
        body: { kind: "storage", providerId: "notion", values: {} }
      }
    )

    expect(expectOk(response).origins).toEqual(["https://api.notion.com/*"])
  })

  it("follows a custom endpoint an llm provider was given", async () => {
    const response: BgResponse<ProviderHostsResponse> = await invoke(
      handlers.providerHosts,
      {
        name: "provider-hosts",
        body: {
          kind: "llm",
          providerId: "openai",
          values: { baseUrl: "https://proxy.example.com/v1" }
        }
      }
    )

    expect(expectOk(response).origins).toContain("https://proxy.example.com/*")
  })

  it("fails on an unknown id instead of answering with an empty list", async () => {
    const response: BgResponse<ProviderHostsResponse> = await invoke(
      handlers.providerHosts,
      {
        name: "provider-hosts",
        body: { kind: "storage", providerId: "dropbox", values: {} }
      }
    )

    // an empty list would read as "this provider needs no permission"
    expect(response.ok).toBe(false)
    expect(response.ok ? "" : response.error).toContain("dropbox")
  })
})

describe("the error envelope", () => {
  it("answers rather than rejecting when a handler throws", async () => {
    const response = await invoke(handlers.markerList, { name: "marker-list" })

    expect(response).toEqual({
      ok: false,
      error: "message was sent without a request body"
    })
  })

  it("reports a misconfigured store without quoting its credential", async () => {
    spy.local.set("bwm:settings", {
      ...DEFAULT_SETTINGS,
      storage: {
        active: "notion",
        configs: [
          { providerId: "notion", values: { pat: NOTION_PAT, databaseId: "" } }
        ]
      }
    })

    const response = await invoke(handlers.markerList, {
      name: "marker-list",
      body: { query: { bookId: CID } }
    })

    expect(response.ok).toBe(false)
    const error = response.ok ? "" : response.error
    expect(error).toContain("databaseId")
    expect(error).not.toContain(NOTION_PAT)
  })
})
