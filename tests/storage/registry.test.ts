import { describe, expect, it } from "vitest"

import {
  ProviderConfigError,
  UnknownProviderError
} from "~/core/provider/descriptor"
import type {
  AppSettings,
  ProviderConfigEntry
} from "~/core/settings/types"
import type { MarkerStore, MarkerStoreDescriptor } from "~/storage/provider"
import { markerStoreRegistry, resolveMarkerStore } from "~/storage/registry"

function settingsWith(
  active: string,
  configs: readonly ProviderConfigEntry[] = []
): AppSettings {
  return {
    storage: { active, configs },
    llm: { active: "openrouter", configs: [] },
    prompts: []
  }
}

const notionValues = { pat: "ntn_secret", databaseId: "db-1" }

describe("resolveMarkerStore", () => {
  it("resolves a provider that needs no configuration", () => {
    expect(resolveMarkerStore(settingsWith("idb")).kind).toBe("idb")
  })

  it("reuses the instance for identical credentials, so a provider's queue and locks survive", () => {
    const settings = settingsWith("notion", [
      { providerId: "notion", values: notionValues }
    ])

    expect(resolveMarkerStore(settings)).toBe(resolveMarkerStore(settings))
  })

  it("rebuilds the instance when the credentials change", () => {
    const first = resolveMarkerStore(
      settingsWith("notion", [{ providerId: "notion", values: notionValues }])
    )
    const second = resolveMarkerStore(
      settingsWith("notion", [
        { providerId: "notion", values: { ...notionValues, pat: "ntn_other" } }
      ])
    )

    expect(second).not.toBe(first)
  })

  it("refuses to build a provider whose required fields are empty", () => {
    expect(() => resolveMarkerStore(settingsWith("notion"))).toThrow(
      ProviderConfigError
    )
  })

  it("names the known providers when the active id is not registered", () => {
    expect(() => resolveMarkerStore(settingsWith("dropbox"))).toThrow(
      UnknownProviderError
    )
  })
})

describe("adding a marker store", () => {
  // The design promise: a new store is one directory plus one register call.
  // If this test ever needs an edit outside these lines, the abstraction leaked.
  it("needs nothing but a descriptor and a register call", () => {
    const created: string[] = []
    const store: MarkerStore = {
      kind: "memory",
      list: async () => [],
      get: async () => null,
      put: async () => undefined,
      remove: async () => undefined,
      listByBook: async () => []
    }
    const descriptor: MarkerStoreDescriptor = {
      id: "memory",
      label: "In-memory (test)",
      fields: [
        { key: "token", label: "Token", kind: "secret", required: true }
      ],
      validate: (values) =>
        (values["token"] ?? "") === ""
          ? [{ field: "token", message: "required" }]
          : [],
      hostsFor: () => ["https://memory.example/*"],
      create: (values) => {
        created.push(values["token"] ?? "")
        return store
      }
    }

    markerStoreRegistry.register(descriptor)

    const resolved = resolveMarkerStore(
      settingsWith("memory", [
        { providerId: "memory", values: { token: "abc" } }
      ])
    )

    expect(resolved).toBe(store)
    expect(created).toEqual(["abc"])
    expect(markerStoreRegistry.list().map((entry) => entry.id)).toContain(
      "memory"
    )
  })
})
