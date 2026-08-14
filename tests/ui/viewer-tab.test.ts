import { beforeEach, describe, expect, it, vi } from "vitest"

import type { ContentCommand } from "~/core/messaging/protocol"
import { sendToViewerTab } from "~/ui/viewer-tab"

interface StubTab {
  readonly id?: number
  readonly url?: string
}

const REMOVE: ContentCommand = {
  type: "content/remove-highlight",
  markerId: "3f1c8e02-0a55-4f7f-9b0e-2c1d7a55e011"
}

let tabs: readonly StubTab[] = []
let reply: () => Promise<unknown> = () => Promise.resolve(null)
let queriedWith: unknown = null
const sent: { readonly tabId: number; readonly command: unknown }[] = []

vi.stubGlobal("chrome", {
  tabs: {
    query: (info: unknown) => {
      queriedWith = info
      return Promise.resolve(tabs)
    },
    sendMessage: (tabId: number, command: unknown) => {
      sent.push({ tabId, command })
      return reply()
    }
  }
})

beforeEach(() => {
  tabs = []
  reply = () => Promise.resolve(null)
  queriedWith = null
  sent.length = 0
})

describe("sendToViewerTab", () => {
  it("relays the command to the viewer tab and reports it delivered", async () => {
    tabs = [{ id: 42, url: "https://viewer.bookwalker.jp/03/12/viewer.html?cid=abc" }]
    expect(await sendToViewerTab(REMOVE)).toBe(true)
    expect(sent).toEqual([{ tabId: 42, command: REMOVE }])
  })

  // The side panel belongs to one window, so the viewer it drives is that window's active
  // tab. A wider query could reach a second window's viewer and repaint a different book.
  it("looks only at the active tab of the panel's own window", async () => {
    tabs = [{ id: 7, url: "https://viewer.bookwalker.jp/viewer.html" }]
    await sendToViewerTab(REMOVE)
    expect(queriedWith).toEqual({ active: true, currentWindow: true })
  })

  // Sending a viewer command to whatever page happens to be open would be worse than not
  // sending it: the caller can tell the user to go back to the viewer, but it cannot undo
  // a command delivered somewhere else.
  it("sends nothing when the active tab is not the viewer", async () => {
    tabs = [{ id: 42, url: "https://bookwalker.jp/de1234/" }]
    expect(await sendToViewerTab(REMOVE)).toBe(false)
    expect(sent).toEqual([])
  })

  // `url` is absent on tabs the extension has no host permission for, which is exactly the
  // case where it must not guess that the tab is a viewer.
  it("sends nothing when the active tab's url is unreadable", async () => {
    tabs = [{ id: 42 }]
    expect(await sendToViewerTab(REMOVE)).toBe(false)
    expect(sent).toEqual([])
  })

  it("reports failure when the viewer tab has no id to address", async () => {
    tabs = [{ url: "https://viewer.bookwalker.jp/viewer.html" }]
    expect(await sendToViewerTab(REMOVE)).toBe(false)
    expect(sent).toEqual([])
  })

  /**
   * A viewer opened before the extension loaded has no content script, so chrome rejects
   * with "Could not establish connection". Callers depend on that surfacing as `false`,
   * not as a throw: the delete flow removes the marker regardless and uses the return
   * value to decide whether to warn that the highlight is still painted. A rejection
   * escaping here would land in the caller's catch and report the deletion as failed.
   */
  it("reports failure instead of throwing when no content script answers", async () => {
    tabs = [{ id: 42, url: "https://viewer.bookwalker.jp/viewer.html" }]
    reply = () => Promise.reject(new Error("Could not establish connection."))
    expect(await sendToViewerTab(REMOVE)).toBe(false)
  })
})
