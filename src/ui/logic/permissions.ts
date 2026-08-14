import type { ProviderSelection } from "~/core/settings/types"

/** Origins kept per form section, plus the union. */
export interface SectionOrigins {
  readonly storage: readonly string[]
  readonly llm: readonly string[]
  /** for the save button alone, which writes both sections in one go */
  readonly origins: readonly string[]
}

/**
 * A button belonging to one section may only ask for that section's origins — prompting for
 * Notion because the user pressed a button in the LLM form is over-asking, and a prompt the
 * user cannot connect to what they clicked is one they deny.
 */
export function sectionOrigins(
  storage: readonly string[],
  llm: readonly string[]
): SectionOrigins {
  const storageOrigins = [...new Set(storage)]
  const llmOrigins = [...new Set(llm)]
  return {
    storage: storageOrigins,
    llm: llmOrigins,
    origins: [...new Set([...storageOrigins, ...llmOrigins])]
  }
}

/** The part of a catalog entry that decides which origins a provider needs. */
export interface OriginSource {
  readonly id: string
  /** origins the provider needs at its default configuration */
  readonly hosts: readonly string[]
}

/**
 * What the active providers need before the user has configured anything, and the
 * fallback while `provider-hosts` has not answered yet. The authoritative answer comes
 * from the provider itself — only it knows whether a custom endpoint replaces its default
 * or adds to it — so this is a floor, never a substitute.
 */
export function defaultOrigins(
  entries: readonly OriginSource[],
  selections: readonly ProviderSelection[]
): readonly string[] {
  const origins = new Set<string>()
  for (const selection of selections) {
    const entry = entries.find((candidate) => candidate.id === selection.active)
    if (entry === undefined) {
      continue
    }
    for (const host of entry.hosts) {
      origins.add(host)
    }
  }
  return [...origins]
}
