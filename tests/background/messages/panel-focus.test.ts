import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { BgResult } from "~/background/message-types"
import { PENDING_FOCUS_KEY } from "~/background/message-types"
import type { BwMarker } from "~/core/marker/types"
import type { PanelFocusMessage } from "~/core/messaging/protocol"
import { invoke, stubChrome, type ChromeSpy } from "./harness"

const marker: BwMarker = {
  id: "marker-1",
  bookId: "book-1",
  bookTitle: "サンプル書籍",
  text: "選択本文",
  memo: "備註",
  color: "rgba(255,255,35,0.588235)",
  locator: {
    epubcfi: "epubcfi(/6/8!/4/2,/1:0,/1:4)",
    capturedProfile: "normal_default",
    byProfile: {}
  },
  progress: 10,
  createdAt: 1,
  updatedAt: 2
}

let spy: ChromeSpy

beforeEach(() => {
  spy = stubChrome()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("panel-focus", () => {
  it("relays and stores the viewer snapshot before a remote fetch", async () => {
    const handler = (await import("~/background/messages/panel-focus")).default
    const response: BgResult<null> = await invoke(handler, {
      name: "panel-focus",
      body: { marker },
      tabId: 7
    })

    expect(response).toEqual({ ok: true, data: null })
    expect(spy.opened).toEqual([7])
    expect(spy.local).toEqual(new Map())
    expect(spy.session.get(PENDING_FOCUS_KEY)).toEqual(marker)
    expect(spy.sent).toEqual<PanelFocusMessage[]>([
      { type: "panel/focus-marker", marker }
    ])
  })
})
