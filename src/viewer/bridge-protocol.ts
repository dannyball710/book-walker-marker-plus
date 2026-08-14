/**
 * Validation for the window.postMessage channel between the MAIN-world bridge
 * and the ISOLATED-world UI. Both ends run in a page we do not control, so every
 * inbound message is `unknown` until it has been read field by field here.
 *
 * The rule across the bridge: validate strictly where data enters our storage
 * (the /pm body, via `core/bwapi/schema` — a malformed marker must not be persisted),
 * leniently where we only observe or relay (/gm, /cri, postMessage), because there
 * a rejected field must degrade rather than abort the whole interception.
 */
import { tryParseRawMarkerItem } from "~/core/bwapi/schema"
import type {
  BookContext,
  FontFace,
  FontSize,
  RawMarkerItem,
  SelectionCaptured
} from "~/core/marker/types"
import type {
  BridgeErrorKind,
  BridgeToUiMessage,
  ContentCommand,
  UiToBridgeMessage
} from "~/core/messaging/protocol"
import { BRIDGE_SOURCE } from "~/core/messaging/protocol"

const FONT_SIZES: readonly FontSize[] = ["small", "normal", "large", "x-large"]

function asObject(value: unknown): object | null {
  return typeof value === "object" && value !== null ? value : null
}

function prop(target: object, key: string): unknown {
  return Reflect.get(target, key)
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

export function readStringProp(value: unknown, key: string): string | null {
  const obj = asObject(value)
  return obj === null ? null : readString(prop(obj, key))
}

const BRIDGE_ERROR_KINDS: readonly BridgeErrorKind[] = [
  "selection-failed",
  "injection-degraded",
  "startup"
]

function readBridgeErrorKind(value: unknown): BridgeErrorKind | null {
  for (const kind of BRIDGE_ERROR_KINDS) {
    if (kind === value) return kind
  }
  return null
}

export function readFontSize(value: unknown): FontSize | null {
  for (const size of FONT_SIZES) {
    if (size === value) return size
  }
  return null
}

function readFontFace(value: unknown): FontFace | null {
  return value === "default" ? "default" : null
}

/** One unreadable entry is skipped: losing a marker beats losing the whole injection. */
function readRawMarkerItems(value: unknown): readonly RawMarkerItem[] | null {
  if (!Array.isArray(value)) return null
  const items: RawMarkerItem[] = []
  for (const entry of value) {
    const item = tryParseRawMarkerItem(entry)
    if (item !== null) items.push(item)
  }
  return items
}

function readSelection(value: unknown): SelectionCaptured | null {
  const obj = asObject(value)
  if (obj === null) return null
  const cid = readString(prop(obj, "cid"))
  const file = readString(prop(obj, "file"))
  const sidx = readNumber(prop(obj, "sidx"))
  const eidx = readNumber(prop(obj, "eidx"))
  const sfs = readFontSize(prop(obj, "sfs"))
  const sff = readFontFace(prop(obj, "sff"))
  const cfi = readString(prop(obj, "cfi"))
  const text = readString(prop(obj, "text"))
  if (
    cid === null ||
    file === null ||
    sidx === null ||
    eidx === null ||
    sfs === null ||
    sff === null ||
    cfi === null ||
    text === null
  ) {
    return null
  }
  return { cid, file, sidx, eidx, sfs, sff, cfi, text }
}

function readBookContext(value: unknown): BookContext | null {
  const obj = asObject(value)
  if (obj === null) return null
  const cid = readString(prop(obj, "cid"))
  const bookTitle = readString(prop(obj, "bookTitle"))
  const u1 = readString(prop(obj, "u1"))
  const bid = readString(prop(obj, "bid"))
  const sfs = readFontSize(prop(obj, "sfs"))
  const sff = readFontFace(prop(obj, "sff"))
  if (
    cid === null ||
    bookTitle === null ||
    u1 === null ||
    bid === null ||
    sfs === null ||
    sff === null
  ) {
    return null
  }
  return { cid, bookTitle, u1, bid, sfs, sff }
}

function envelope(data: unknown): { readonly type: string; readonly payload: unknown } | null {
  const obj = asObject(data)
  if (obj === null || prop(obj, "source") !== BRIDGE_SOURCE) return null
  const type = readString(prop(obj, "type"))
  if (type === null) return null
  return { type, payload: prop(obj, "payload") }
}

export function parseUiToBridgeMessage(data: unknown): UiToBridgeMessage | null {
  const message = envelope(data)
  if (message === null) return null
  const payload = asObject(message.payload)
  switch (message.type) {
    case "gm-response": {
      if (payload === null) return null
      const reqId = readString(prop(payload, "reqId"))
      const markers = readRawMarkerItems(prop(payload, "markers"))
      if (reqId === null || markers === null) return null
      return { source: BRIDGE_SOURCE, type: "gm-response", payload: { reqId, markers } }
    }
    default:
      return null
  }
}

/** Commands the side panel sends straight to the viewer tab via chrome.tabs.sendMessage. */
export function parseContentCommand(data: unknown): ContentCommand | null {
  const obj = asObject(data)
  if (obj === null) return null
  const type = readString(prop(obj, "type"))
  switch (type) {
    case "content/refresh-markers":
      return { type }
    case "content/remove-highlight": {
      const markerId = readString(prop(obj, "markerId"))
      if (markerId === null) return null
      return { type, markerId }
    }
    default:
      return null
  }
}

export function parseBridgeToUiMessage(data: unknown): BridgeToUiMessage | null {
  const message = envelope(data)
  if (message === null) return null
  const payload = asObject(message.payload)
  switch (message.type) {
    case "book-context": {
      const context = readBookContext(message.payload)
      if (context === null) return null
      return { source: BRIDGE_SOURCE, type: "book-context", payload: context }
    }
    case "selection": {
      const selection = readSelection(message.payload)
      if (selection === null) return null
      return { source: BRIDGE_SOURCE, type: "selection", payload: selection }
    }
    case "gm-request": {
      if (payload === null) return null
      const cid = readString(prop(payload, "cid"))
      const reqId = readString(prop(payload, "reqId"))
      if (cid === null || reqId === null) return null
      return { source: BRIDGE_SOURCE, type: "gm-request", payload: { cid, reqId } }
    }
    case "bridge-error": {
      if (payload === null) return null
      const kind = readBridgeErrorKind(prop(payload, "kind"))
      const reason = readString(prop(payload, "reason"))
      if (kind === null || reason === null) return null
      return { source: BRIDGE_SOURCE, type: "bridge-error", payload: { kind, reason } }
    }
    default:
      return null
  }
}
