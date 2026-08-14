import { parseSettings } from "~/core/settings/defaults"
import type { AppSettings } from "~/core/settings/types"

/** `local`, never `sync`: settings carry API keys and a PAT. */
const SETTINGS_KEY = "bwm:settings"

export async function getSettings(): Promise<AppSettings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY)
  const raw: unknown = stored[SETTINGS_KEY]
  return parseSettings(raw)
}

export async function setSettings(next: AppSettings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: next })
}

export function onSettingsChanged(cb: (s: AppSettings) => void): () => void {
  const listener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: chrome.storage.AreaName
  ): void => {
    if (areaName !== "local") {
      return
    }
    const change = changes[SETTINGS_KEY]
    if (change === undefined) {
      return
    }
    const raw: unknown = change.newValue
    cb(parseSettings(raw))
  }
  chrome.storage.onChanged.addListener(listener)
  return () => chrome.storage.onChanged.removeListener(listener)
}
