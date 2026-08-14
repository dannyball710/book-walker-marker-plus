import { afterEach, describe, expect, it, vi } from "vitest"

import {
  readBrowserId,
  readCidFromLocation,
  readViewerFontSize
} from "~/viewer/page-state"

const SETTINGS_KEY = "/NFBR_Settings/NFBR.SettingData"
const BROWSER_ID_KEY = "NFBR.Global/BrowserId"

function stubViewer(search: string, store: Record<string, string>): void {
  vi.stubGlobal("window", {
    location: { search },
    localStorage: {
      getItem: (key: string): string | null => store[key] ?? null
    }
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("readCidFromLocation", () => {
  it("reads the content id the viewer was opened with", () => {
    stubViewer("?cid=abcd1234&mode=1", {})
    expect(readCidFromLocation()).toBe("abcd1234")
  })

  // The bridge is injected on every viewer navigation, including ones that carry no cid.
  // Returning "" lets the caller skip the book-scoped work; throwing would abort startup.
  it("degrades to an empty id instead of throwing when the url carries no cid", () => {
    stubViewer("", {})
    expect(readCidFromLocation()).toBe("")
  })
})

describe("readBrowserId", () => {
  it("reads the BrowserId the viewer stores for browserWebApi calls", () => {
    stubViewer("", { [BROWSER_ID_KEY]: "bid-9f21" })
    expect(readBrowserId()).toBe("bid-9f21")
  })

  // Absent before the viewer's first API call. The request is built anyway and fails
  // legibly server-side, which beats blocking the whole injection on a missing key.
  it("degrades to an empty id when the viewer has not written one yet", () => {
    stubViewer("", {})
    expect(readBrowserId()).toBe("")
  })
})

describe("readViewerFontSize", () => {
  it("reads the size the viewer is currently rendering at", () => {
    stubViewer("", {
      [SETTINGS_KEY]: JSON.stringify({ viewerFontSize: "large" })
    })
    expect(readViewerFontSize()).toBe("large")
  })

  /**
   * The hyphen has to survive: region indexes are relative to this size, and the marker's
   * position map is keyed by `x-large_default`. Anything that sanitised it here — the
   * `x_large` spelling the IndexedDB key path forces — would look up a profile the viewer
   * never wrote and silently paint the highlight at the wrong place.
   */
  it("keeps x-large spelled exactly as the viewer writes it", () => {
    stubViewer("", {
      [SETTINGS_KEY]: JSON.stringify({ viewerFontSize: "x-large" })
    })
    expect(readViewerFontSize()).toBe("x-large")
  })

  // Every fallback below lands on "normal" because that is the viewer's own default: a
  // wrong-but-plausible size would place markers off by whole paragraphs, so guessing is
  // worse than assuming the untouched setting.
  it("falls back to normal when the viewer has never saved settings", () => {
    stubViewer("", {})
    expect(readViewerFontSize()).toBe("normal")
  })

  it("falls back to normal when the stored settings are not valid JSON", () => {
    stubViewer("", { [SETTINGS_KEY]: "{viewerFontSize:" })
    expect(readViewerFontSize()).toBe("normal")
  })

  it("falls back to normal when the stored JSON is not an object", () => {
    stubViewer("", { [SETTINGS_KEY]: "null" })
    expect(readViewerFontSize()).toBe("normal")
    stubViewer("", { [SETTINGS_KEY]: '"large"' })
    expect(readViewerFontSize()).toBe("normal")
  })

  it("falls back to normal when the settings object has no viewerFontSize", () => {
    stubViewer("", { [SETTINGS_KEY]: JSON.stringify({ viewerFontFace: "default" }) })
    expect(readViewerFontSize()).toBe("normal")
  })

  // A size the viewer added after this build must not reach the profile key, which is a
  // closed set on the storage side.
  it("falls back to normal for a size this build does not know", () => {
    stubViewer("", { [SETTINGS_KEY]: JSON.stringify({ viewerFontSize: "xx-large" }) })
    expect(readViewerFontSize()).toBe("normal")
  })
})
