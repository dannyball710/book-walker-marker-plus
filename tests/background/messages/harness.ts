/**
 * Drives background message handlers the way Plasmo does, over a real IndexedDB and
 * stubbed chrome surfaces. Handlers are only ever exercised end to end here — the
 * point is the flow between them, not the functions in isolation.
 */
import "fake-indexeddb/auto"

import type { MessageName, PlasmoMessaging } from "@plasmohq/messaging"
import { vi } from "vitest"

import type { BookContext, SelectionCaptured } from "~/core/marker/types"

export interface ChromeSpy {
  readonly session: Map<string, unknown>
  readonly local: Map<string, unknown>
  /** everything passed to chrome.runtime.sendMessage */
  readonly sent: unknown[]
  /** tabIds chrome.sidePanel.open was called with */
  readonly opened: number[]
  failSidePanel: boolean
}

export function stubChrome(): ChromeSpy {
  const spy: ChromeSpy = {
    session: new Map(),
    local: new Map(),
    sent: [],
    opened: [],
    failSidePanel: false
  }

  const area = (store: Map<string, unknown>) => ({
    get: async (key: string) =>
      store.has(key) ? { [key]: store.get(key) } : {},
    set: async (items: { [key: string]: unknown }) => {
      for (const [key, value] of Object.entries(items)) {
        store.set(key, value)
      }
    },
    remove: async (key: string) => {
      store.delete(key)
    }
  })

  vi.stubGlobal("chrome", {
    storage: {
      session: area(spy.session),
      local: area(spy.local),
      onChanged: { addListener: () => undefined, removeListener: () => undefined }
    },
    runtime: {
      sendMessage: async (message: unknown) => {
        spy.sent.push(message)
      }
    },
    sidePanel: {
      open: async ({ tabId }: { tabId: number }) => {
        if (spy.failSidePanel) {
          throw new Error("`sidePanel.open()` may only be called in response to a user gesture.")
        }
        spy.opened.push(tabId)
      }
    },
    permissions: { contains: async () => true }
  })

  return spy
}

export function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase("bwm")
    request.onsuccess = () => resolve()
    request.onblocked = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

/** Only `id` is ever read; the rest is what chrome.tabs.Tab demands. */
function fakeTab(id: number): chrome.tabs.Tab {
  return {
    id,
    index: 0,
    windowId: 1,
    groupId: -1,
    active: true,
    pinned: false,
    highlighted: true,
    incognito: false,
    selected: true,
    discarded: false,
    autoDiscardable: true,
    url: "https://viewer.bookwalker.jp/03/30/viewer.html"
  }
}

export type BgResponse<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: string }

/**
 * Never rejects, mirroring the envelope contract: a handler that throws must still
 * answer. A test asserting `ok: false` would otherwise pass on a rejection too.
 */
export async function invoke<Req, Res>(
  handler: PlasmoMessaging.MessageHandler<Req, Res>,
  input: {
    readonly name: MessageName
    readonly body?: Req
    readonly tabId?: number
  }
): Promise<Res> {
  let captured: Res | undefined
  const request: PlasmoMessaging.Request<MessageName, Req> = { name: input.name }
  if (input.body !== undefined) {
    request.body = input.body
  }
  if (input.tabId !== undefined) {
    request.sender = { tab: fakeTab(input.tabId) }
  }

  await handler(request, {
    send: (response) => {
      captured = response
    }
  })

  if (captured === undefined) {
    throw new Error(`handler for "${String(input.name)}" sent no response`)
  }
  return captured
}

export function expectOk<T>(response: BgResponse<T>): T {
  if (!response.ok) {
    throw new Error(`expected ok, got: ${response.error}`)
  }
  return response.data
}

export const CID = "2450bba4-bee3-4db6-95db-e668c4c76fdd"

export const bookContext: BookContext = {
  cid: CID,
  bookTitle: "サンプル書籍",
  u1: "u1-token",
  bid: "bid-token",
  sfs: "normal",
  sff: "default"
}

export const selection: SelectionCaptured = {
  cid: CID,
  file: "item/xhtml/p-003.xhtml",
  sidx: 20,
  eidx: 32,
  sfs: "normal",
  sff: "default",
  cfi: "epubcfi(/6/14[p-003]!/4/2,/1:0,/1:12)",
  text: "これはテスト用の本文である。"
}

