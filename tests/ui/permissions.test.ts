import { describe, expect, it } from "vitest"

import type { ProviderSelection } from "~/core/settings/types"
import {
  defaultOrigins,
  sectionOrigins,
  type OriginSource
} from "~/ui/logic/permissions"

const entries: readonly OriginSource[] = [
  { id: "idb", hosts: [] },
  { id: "openrouter", hosts: ["https://openrouter.ai/*"] },
  { id: "openai", hosts: ["https://api.openai.com/*"] },
  { id: "notion", hosts: ["https://api.notion.com/*"] }
]

function selection(active: string): ProviderSelection {
  return { active, configs: [] }
}

describe("defaultOrigins", () => {
  it("asks for nothing when the active provider needs no host", () => {
    expect(defaultOrigins(entries, [selection("idb")])).toEqual([])
  })

  it("reports the active provider's default host", () => {
    expect(defaultOrigins(entries, [selection("openrouter")])).toEqual([
      "https://openrouter.ai/*"
    ])
  })

  it("merges both sections", () => {
    expect(defaultOrigins(entries, [selection("notion"), selection("openai")])).toEqual([
      "https://api.notion.com/*",
      "https://api.openai.com/*"
    ])
  })

  it("de-duplicates a host both sections need", () => {
    const shared: readonly OriginSource[] = [
      { id: "a", hosts: ["https://common.test/*"] },
      { id: "b", hosts: ["https://common.test/*"] }
    ]
    expect(defaultOrigins(shared, [selection("a"), selection("b")])).toEqual([
      "https://common.test/*"
    ])
  })

  it("ignores providers that are configured but not active", () => {
    const inactive: ProviderSelection = {
      active: "idb",
      configs: [{ providerId: "openai", values: { apiKey: "k" } }]
    }
    expect(defaultOrigins(entries, [inactive])).toEqual([])
  })

  it("asks for nothing when the stored provider id is no longer offered", () => {
    expect(defaultOrigins(entries, [selection("dropbox")])).toEqual([])
  })
})

describe("sectionOrigins", () => {
  const notion = "https://api.notion.com/*"
  const openrouter = "https://openrouter.ai/*"

  it("never lets one section's button ask for the other section's origins", () => {
    const result = sectionOrigins([notion], [openrouter])
    expect(result.storage).toEqual([notion])
    expect(result.llm).toEqual([openrouter])
  })

  it("keeps the union for the save button, which writes both sections at once", () => {
    expect(sectionOrigins([notion], [openrouter]).origins).toEqual([notion, openrouter])
  })

  it("de-duplicates a host both sections need, so the prompt lists it once", () => {
    const shared = "https://common.test/*"
    expect(sectionOrigins([shared], [shared]).origins).toEqual([shared])
  })

  it("de-duplicates within a section, so a repeated fallback cannot double the prompt", () => {
    expect(sectionOrigins([notion, notion], []).storage).toEqual([notion])
  })

  it("reports a provider that needs no host as asking for nothing", () => {
    expect(sectionOrigins([], [])).toEqual({ storage: [], llm: [], origins: [] })
  })
})
