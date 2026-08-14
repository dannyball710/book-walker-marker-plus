import { describe, expect, it } from "vitest"

import {
  parseBridgeToUiMessage,
  parseContentCommand,
  parseUiToBridgeMessage
} from "~/viewer/bridge-protocol"
import { BRIDGE_SOURCE } from "~/core/messaging/protocol"

const RAW_ITEM = {
  id: "bec131df-9b6d-4435-9ee7-fdedc4980bd7",
  epubcfi: "epubcfi(/6/24!/4/2/8,/3:11,/3:15)",
  text: "テスト本文",
  memo: "test",
  color: "rgba(255,150,200,0.588235)",
  shape: "rect",
  date: "2026-08-14T12:48:49+0900",
  pr: 3,
  appendix: {
    browser: {
      sidx: 25,
      sFile: "item/xhtml/p-003.xhtml",
      eidx: 28,
      eFile: "item/xhtml/p-003.xhtml",
      position: { normal_default: "item/xhtml/p-003.xhtml#-acs-position-20-0" }
    }
  }
}

describe("parseUiToBridgeMessage", () => {
  it("ignores messages that are not tagged with the bridge source", () => {
    expect(
      parseUiToBridgeMessage({
        type: "gm-response",
        source: "other",
        payload: { reqId: "r1", markers: [] }
      })
    ).toBeNull()
    expect(
      parseUiToBridgeMessage({
        type: "gm-response",
        payload: { reqId: "r1", markers: [] }
      })
    ).toBeNull()
  })

  it("reads a gm-response with its marker payload", () => {
    const parsed = parseUiToBridgeMessage({
      source: BRIDGE_SOURCE,
      type: "gm-response",
      payload: { reqId: "r1", markers: [RAW_ITEM] }
    })
    expect(parsed).toEqual({
      source: BRIDGE_SOURCE,
      type: "gm-response",
      payload: { reqId: "r1", markers: [RAW_ITEM] }
    })
  })

  it("skips an unreadable marker instead of dropping the whole injection", () => {
    const parsed = parseUiToBridgeMessage({
      source: BRIDGE_SOURCE,
      type: "gm-response",
      payload: { reqId: "r1", markers: [{ id: "x" }, RAW_ITEM] }
    })
    expect(parsed).toEqual({
      source: BRIDGE_SOURCE,
      type: "gm-response",
      payload: { reqId: "r1", markers: [RAW_ITEM] }
    })
  })

  it("still rejects a gm-response whose markers are not an array", () => {
    expect(
      parseUiToBridgeMessage({
        source: BRIDGE_SOURCE,
        type: "gm-response",
        payload: { reqId: "r1", markers: "none" }
      })
    ).toBeNull()
  })

  it("rejects unknown message types", () => {
    expect(
      parseUiToBridgeMessage({ source: BRIDGE_SOURCE, type: "eval", payload: {} })
    ).toBeNull()
  })
})

describe("parseContentCommand", () => {
  it("reads the command that carries no payload", () => {
    expect(parseContentCommand({ type: "content/refresh-markers" })).toEqual({
      type: "content/refresh-markers"
    })
  })

  it("requires a marker id to unpaint a highlight", () => {
    expect(
      parseContentCommand({ type: "content/remove-highlight", markerId: "m1" })
    ).toEqual({ type: "content/remove-highlight", markerId: "m1" })
    expect(parseContentCommand({ type: "content/remove-highlight" })).toBeNull()
  })

  it("ignores runtime messages meant for someone else", () => {
    expect(parseContentCommand({ type: "panel/focus-marker", markerId: "m1" })).toBeNull()
    expect(parseContentCommand(undefined)).toBeNull()
  })
})

describe("parseBridgeToUiMessage", () => {
  it("reads a book context with a valid font profile", () => {
    const payload = {
      cid: "2450bba4",
      bookTitle: "サンプル書籍",
      u1: "fc165442",
      bid: "177815028231487709004NFBR",
      sfs: "normal",
      sff: "default"
    }
    expect(
      parseBridgeToUiMessage({ source: BRIDGE_SOURCE, type: "book-context", payload })
    ).toEqual({ source: BRIDGE_SOURCE, type: "book-context", payload })
  })

  it("rejects a book context whose font size is not a viewer profile", () => {
    expect(
      parseBridgeToUiMessage({
        source: BRIDGE_SOURCE,
        type: "book-context",
        payload: {
          cid: "c",
          bookTitle: "t",
          u1: "u",
          bid: "b",
          sfs: "huge",
          sff: "default"
        }
      })
    ).toBeNull()
  })

  it("reads a selection captured from /cri", () => {
    const payload = {
      cid: "2450bba4",
      file: "item/xhtml/p-003.xhtml",
      sidx: 25,
      eidx: 28,
      sfs: "normal",
      sff: "default",
      cfi: "epubcfi(/6/24!/4/2/8,/3:11,/3:15)",
      text: "テスト本文"
    }
    expect(
      parseBridgeToUiMessage({ source: BRIDGE_SOURCE, type: "selection", payload })
    ).toEqual({ source: BRIDGE_SOURCE, type: "selection", payload })
  })

  it("reads gm-request and bridge-error", () => {
    expect(
      parseBridgeToUiMessage({
        source: BRIDGE_SOURCE,
        type: "gm-request",
        payload: { cid: "c", reqId: "r1" }
      })
    ).toEqual({
      source: BRIDGE_SOURCE,
      type: "gm-request",
      payload: { cid: "c", reqId: "r1" }
    })
    expect(
      parseBridgeToUiMessage({
        source: BRIDGE_SOURCE,
        type: "bridge-error",
        payload: { kind: "startup", reason: "NFBR missing" }
      })
    ).toEqual({
      source: BRIDGE_SOURCE,
      type: "bridge-error",
      payload: { kind: "startup", reason: "NFBR missing" }
    })
  })

  it("reads every severity the UI branches on", () => {
    for (const kind of ["selection-failed", "injection-degraded", "startup"]) {
      expect(
        parseBridgeToUiMessage({
          source: BRIDGE_SOURCE,
          type: "bridge-error",
          payload: { kind, reason: "why" }
        })
      ).toEqual({
        source: BRIDGE_SOURCE,
        type: "bridge-error",
        payload: { kind, reason: "why" }
      })
    }
  })

  it("rejects a bridge-error with no usable severity, which decides whether the user is interrupted", () => {
    expect(
      parseBridgeToUiMessage({
        source: BRIDGE_SOURCE,
        type: "bridge-error",
        payload: { reason: "no kind" }
      })
    ).toBeNull()
    expect(
      parseBridgeToUiMessage({
        source: BRIDGE_SOURCE,
        type: "bridge-error",
        payload: { kind: "catastrophe", reason: "unknown kind" }
      })
    ).toBeNull()
  })

  it("ignores page messages that merely look similar", () => {
    expect(parseBridgeToUiMessage({ source: "bwm2", type: "selection" })).toBeNull()
    expect(parseBridgeToUiMessage("bwm")).toBeNull()
  })
})
