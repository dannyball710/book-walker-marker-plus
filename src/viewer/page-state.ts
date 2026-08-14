/**
 * Reads of the viewer's own page state (URL + localStorage), shared by both
 * content-script worlds.
 */
import type { FontSize } from "~/core/marker/types"

import { readFontSize } from "./bridge-protocol"

const SETTINGS_KEY = "/NFBR_Settings/NFBR.SettingData"
const BROWSER_ID_KEY = "NFBR.Global/BrowserId"

export function readCidFromLocation(): string {
  return new URLSearchParams(window.location.search).get("cid") ?? ""
}

export function readBrowserId(): string {
  return window.localStorage.getItem(BROWSER_ID_KEY) ?? ""
}

/** `viewerFontSize` decides `sfs`, which region indexes are relative to. */
export function readViewerFontSize(): FontSize {
  const raw = window.localStorage.getItem(SETTINGS_KEY)
  if (raw === null) return "normal"
  let settings: unknown
  try {
    settings = JSON.parse(raw)
  } catch {
    return "normal"
  }
  if (typeof settings !== "object" || settings === null) return "normal"
  return readFontSize(Reflect.get(settings, "viewerFontSize")) ?? "normal"
}
