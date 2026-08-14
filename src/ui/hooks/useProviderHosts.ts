import { useEffect, useState } from "react"

import type { ProviderCatalogEntry } from "~/core/messaging/protocol"
import { findProviderConfig, type ProviderSelection } from "~/core/settings/types"
import {
  defaultOrigins,
  sectionOrigins,
  type SectionOrigins
} from "~/ui/logic/permissions"
import { fetchProviderHosts } from "~/ui/messages"

/** Long enough that typing an endpoint does not fire per keystroke, short enough to
 *  have settled by the time the user reaches the save button. */
const DEBOUNCE_MS = 300

export interface ProviderHostsResult extends SectionOrigins {
  /** false while the answer is still the catalog's defaults rather than the provider's */
  readonly resolved: boolean
}

async function originsFor(
  catalog: readonly ProviderCatalogEntry[],
  selection: ProviderSelection
): Promise<readonly string[]> {
  const entry = catalog.find((candidate) => candidate.id === selection.active)
  if (entry === undefined) {
    return []
  }
  return fetchProviderHosts({
    kind: entry.kind,
    providerId: entry.id,
    values: findProviderConfig(selection, entry.id)
  })
}

/**
 * `chrome.permissions.request` only prompts while the click is still on the stack, so the
 * answer has to exist before the user presses save. Refreshed whenever the form changes
 * and read synchronously from state at click time.
 */
export function useProviderHosts(
  catalog: readonly ProviderCatalogEntry[],
  storage: ProviderSelection,
  llm: ProviderSelection
): ProviderHostsResult {
  const [result, setResult] = useState<ProviderHostsResult>({
    ...sectionOrigins([], []),
    resolved: false
  })

  useEffect(() => {
    let alive = true
    const fallback = sectionOrigins(
      defaultOrigins(catalog, [storage]),
      defaultOrigins(catalog, [llm])
    )
    const timer = window.setTimeout(() => {
      Promise.all([originsFor(catalog, storage), originsFor(catalog, llm)])
        .then(([storageHosts, llmHosts]) => {
          if (alive) {
            setResult({ ...sectionOrigins(storageHosts, llmHosts), resolved: true })
          }
        })
        .catch(() => {
          // Asking for too little is what breaks the provider, so an unanswered call
          // falls back to the defaults rather than to nothing.
          if (alive) {
            setResult({ ...fallback, resolved: false })
          }
        })
    }, DEBOUNCE_MS)

    // Clicking save inside the debounce window would otherwise request the previous
    // values' origins. Widening each section until the answer lands keeps that click
    // over-asking for a moment rather than saving a provider it cannot reach.
    setResult((current) => ({
      ...sectionOrigins(
        [...current.storage, ...fallback.storage],
        [...current.llm, ...fallback.llm]
      ),
      resolved: false
    }))
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [catalog, storage, llm])

  return result
}
