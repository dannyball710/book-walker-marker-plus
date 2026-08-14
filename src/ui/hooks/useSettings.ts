import { useCallback, useEffect, useState } from "react"

import type { AppSettings } from "~/core/settings/types"
import { fetchSettings } from "~/ui/messages"

export interface SettingsResult {
  readonly settings: AppSettings | null
  readonly error: string | null
  readonly reload: () => void
}

/** Read-only view of the stored settings; the panel never writes them. */
export function useSettings(): SettingsResult {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let alive = true
    fetchSettings()
      .then((next) => {
        if (alive) {
          setSettings(next)
          setError(null)
        }
      })
      .catch((cause: unknown) => {
        if (alive) {
          setError(cause instanceof Error ? cause.message : String(cause))
        }
      })
    return () => {
      alive = false
    }
  }, [nonce])

  const reload = useCallback(() => setNonce((value) => value + 1), [])

  return { settings, error, reload }
}
