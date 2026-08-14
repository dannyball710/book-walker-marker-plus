/**
 * MAIN-world bridge: patches XMLHttpRequest so the extension can read /cri,
 * block /pm and inject into /gm. It shares the page's JS realm, so it has no
 * chrome.* APIs and talks to the ISOLATED world through window.postMessage only.
 */
import type { PlasmoCSConfig } from "plasmo"

import type { BwEndpoint, CriQuery } from "~/core/bwapi/urls"
import { classifyBwApiUrl, parseCriQuery } from "~/core/bwapi/urls"
import type { FontFace, RawMarkerItem } from "~/core/marker/types"
import type { BridgeErrorKind, BridgeToUiMessage } from "~/core/messaging/protocol"
import { BRIDGE_SOURCE } from "~/core/messaging/protocol"

import { parseUiToBridgeMessage, readStringProp } from "~/viewer/bridge-protocol"
import { mergeGetMarkerResponse } from "~/viewer/gm-merge"
import { readBrowserId, readCidFromLocation, readViewerFontSize } from "~/viewer/page-state"

// The `*` already covers the version segment (`03/30`), so this stays version-agnostic
// while keeping the XHR patch off every other page on the host.
export const config: PlasmoCSConfig = {
  matches: ["https://viewer.bookwalker.jp/*/viewer.html*"],
  world: "MAIN",
  run_at: "document_start"
}

/** How long /gm waits for the extension's marker snapshot before passing through. */
const GM_INJECTION_TIMEOUT_MS = 1500
const VIEWER_READY_TIMEOUT_MS = 5000
const VIEWER_POLL_INTERVAL_MS = 200
/** The viewer opens its dialog some time after /cri answers, so it is waited for. */
const DIALOG_DISMISS_TIMEOUT_MS = 2000
const DIALOG_POLL_INTERVAL_MS = 100

const CANCEL_LABELS: readonly string[] = ["cancel", "キャンセル", "取消"]

/** The body a real /pm answers with, handed back when we decline the viewer's write. */
const PM_SUCCESS_BODY = '{"status":"200"}'

interface RequestRecord {
  readonly method: string
  readonly url: string
  readonly endpoint: BwEndpoint
  readonly headers: [string, string][]
}

const requests = new WeakMap<XMLHttpRequest, RequestRecord>()
const pendingInjections = new Map<string, (markers: readonly RawMarkerItem[]) => void>()

let injectionSeq = 0
let userToken: string | null = null
let bookTitle: string | null = null
let fontFace: FontFace = "default"
/** Identity of the last context posted, so a font change mid-session is not swallowed. */
let lastContextKey: string | null = null

const nativeOpen = XMLHttpRequest.prototype.open
const nativeSend = XMLHttpRequest.prototype.send
const nativeSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader
const nativeFetch = window.fetch

function postToUi(message: BridgeToUiMessage): void {
  window.postMessage(message, window.location.origin)
}

function reportError(kind: BridgeErrorKind, reason: string): void {
  postToUi({ source: BRIDGE_SOURCE, type: "bridge-error", payload: { kind, reason } })
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function parseJson(text: string): unknown {
  return JSON.parse(text)
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** `responseText` throws once responseType is set to anything but text. */
function responseBodyOf(xhr: XMLHttpRequest): unknown {
  const type = xhr.responseType
  if (type === "" || type === "text") return parseJson(xhr.responseText)
  return xhr.response
}

function captureUserToken(url: string): void {
  const token = new URL(url, window.location.href).searchParams.get("u1")
  if (token === null || token === userToken) return
  userToken = token
  postBookContextIfReady()
}

/**
 * Re-posts whenever the context actually changed. The font size is read fresh every
 * time: the viewer reflows in place, and background keys the /ric backfill off the
 * profile it last heard about.
 */
function postBookContextIfReady(): void {
  if (userToken === null || bookTitle === null) return
  const cid = readCidFromLocation()
  if (cid === "") return
  const payload = {
    cid,
    bookTitle,
    u1: userToken,
    bid: readBrowserId(),
    sfs: readViewerFontSize(),
    sff: fontFace
  }
  const key = `${payload.cid}|${payload.u1}|${payload.bid}|${payload.sfs}|${payload.sff}|${payload.bookTitle}`
  if (key === lastContextKey) return
  lastContextKey = key
  postToUi({ source: BRIDGE_SOURCE, type: "book-context", payload })
}

function headersOf(xhr: XMLHttpRequest): ReadonlyMap<string, string> {
  const headers = new Map<string, string>()
  for (const line of xhr.getAllResponseHeaders().split("\r\n")) {
    const separator = line.indexOf(":")
    if (separator <= 0) continue
    headers.set(line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim())
  }
  return headers
}

/**
 * XHR's response fields are read-only accessors on the prototype; shadowing them
 * with own properties is the only way to hand the viewer a response we made up
 * without touching the network.
 */
function defineResponse(
  xhr: XMLHttpRequest,
  url: string,
  status: number,
  statusText: string,
  text: string,
  headers: ReadonlyMap<string, string>
): void {
  const body: unknown = xhr.responseType === "json" ? tryParseJson(text) : text
  const headerLines = [...headers].map(([name, value]) => `${name}: ${value}`).join("\r\n")
  const define = (key: string, value: () => unknown): void => {
    Object.defineProperty(xhr, key, { configurable: true, get: value })
  }
  define("readyState", () => XMLHttpRequest.DONE)
  define("status", () => status)
  define("statusText", () => statusText)
  define("responseText", () => text)
  define("response", () => body)
  define("responseURL", () => url)
  Object.defineProperty(xhr, "getAllResponseHeaders", {
    configurable: true,
    value: (): string => (headerLines === "" ? "" : `${headerLines}\r\n`)
  })
  Object.defineProperty(xhr, "getResponseHeader", {
    configurable: true,
    value: (name: string): string | null => headers.get(name.toLowerCase()) ?? null
  })
}

function dispatchDone(xhr: XMLHttpRequest, kind: "load" | "error"): void {
  xhr.dispatchEvent(new Event("readystatechange"))
  xhr.dispatchEvent(new ProgressEvent(kind))
  xhr.dispatchEvent(new ProgressEvent("loadend"))
}

function completeWithJson(xhr: XMLHttpRequest, url: string, text: string): void {
  defineResponse(xhr, url, 200, "OK", text, new Map([["content-type", "application/json"]]))
  setTimeout(() => dispatchDone(xhr, "load"), 0)
}

function failRequest(xhr: XMLHttpRequest, url: string, reason: string): void {
  reportError("injection-degraded", reason)
  defineResponse(xhr, url, 0, "", "", new Map())
  dispatchDone(xhr, "error")
}

/**
 * jQuery UI closes a dialog by setting `display:none` on it. Our CSS only makes it
 * transparent, so `display` is still the viewer's own open/closed state.
 */
function isDialogOpen(dialog: Element): boolean {
  return window.getComputedStyle(dialog).display !== "none"
}

/**
 * The class names inside the dialog are minified and unverified, so the label text is
 * the fallback, and jQuery UI's own title-bar close button is the last resort — it is
 * the one control the widget always renders, and closing is what we want either way.
 */
function findCancelControl(dialog: Element): HTMLElement | null {
  const named = dialog.querySelector(".cancelButton")
  if (named instanceof HTMLElement) return named
  for (const element of dialog.querySelectorAll(
    "button, a, input[type=button], input[type=submit]"
  )) {
    if (!(element instanceof HTMLElement)) continue
    const text = element instanceof HTMLInputElement ? element.value : (element.textContent ?? "")
    if (CANCEL_LABELS.includes(text.trim().toLowerCase())) return element
  }
  const close = dialog.querySelector(".ui-dialog-titlebar-close")
  return close instanceof HTMLElement ? close : null
}

let dismissTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Declines the viewer's own marker dialog. The extension creates the marker itself, so
 * nothing else would ever close this dialog, and leaving it open keeps the viewer in its
 * registration state — with a modal overlay over the page if the viewer opened it that
 * way, which would swallow the reader's clicks for the rest of the session.
 *
 * A dialog that never appears is not a problem: there is then nothing to decline, so the
 * wait simply expires. Only a dialog we cannot close is worth reporting.
 */
function dismissMarkerDialog(): void {
  if (dismissTimer !== null) clearTimeout(dismissTimer)
  const startedAt = Date.now()
  const attempt = (): void => {
    dismissTimer = null
    const dialog = document.querySelector(".markerRegisterDialog")
    if (dialog !== null && isDialogOpen(dialog)) {
      const cancel = findCancelControl(dialog)
      if (cancel === null) {
        reportError(
          "injection-degraded",
          "the viewer's marker dialog has no control that closes it; it stays open behind the panel"
        )
        return
      }
      // `pointer-events: none` only blocks real pointer input, never a dispatched click.
      cancel.click()
      return
    }
    if (Date.now() - startedAt > DIALOG_DISMISS_TIMEOUT_MS) return
    dismissTimer = setTimeout(attempt, DIALOG_POLL_INTERVAL_MS)
  }
  attempt()
}

function watchCri(xhr: XMLHttpRequest, url: string): void {
  const query = parseCriQuery(url)
  if (query === null) return
  fontFace = query.sff
  captureUserToken(url)
  // A selection is the cheapest checkpoint for noticing a font change.
  postBookContextIfReady()
  xhr.addEventListener("load", () => {
    if (xhr.status !== 200) return
    postSelection(xhr, query)
    // Runs whether or not the selection could be read: the viewer opens its dialog for
    // this selection either way, and the reader must not be left with it stuck open.
    dismissMarkerDialog()
  })
}

function postSelection(xhr: XMLHttpRequest, query: CriQuery): void {
  try {
    const body = responseBodyOf(xhr)
    const cfi = readStringProp(body, "cfi")
    const text = readStringProp(body, "text")
    if (cfi === null || text === null) {
      reportError("selection-failed", "/cri response carried no cfi or text")
      return
    }
    postToUi({
      source: BRIDGE_SOURCE,
      type: "selection",
      payload: {
        cid: query.cid,
        file: query.file,
        sidx: query.sidx,
        eidx: query.eidx,
        sfs: query.sfs,
        sff: query.sff,
        cfi,
        text
      }
    })
  } catch (error) {
    reportError("selection-failed", `failed to read /cri response: ${describeError(error)}`)
  }
}

function watchContentCheck(xhr: XMLHttpRequest, url: string): void {
  captureUserToken(url)
  xhr.addEventListener("load", () => {
    if (xhr.status !== 200) return
    try {
      bookTitle = readStringProp(responseBodyOf(xhr), "cti")
      postBookContextIfReady()
    } catch (error) {
      reportError("startup", `failed to read /c response: ${describeError(error)}`)
    }
  })
}

/**
 * `/pm` is a full-snapshot overwrite of the account's marker list, so it is answered
 * with a faked success and never reaches the network. The body is not read at all:
 * markers are created by the extension itself, so there is nothing in it to adopt.
 */
function shortCircuitPutMarker(xhr: XMLHttpRequest, url: string): void {
  completeWithJson(xhr, url, PM_SUCCESS_BODY)
}

function requestInjection(cid: string): Promise<readonly RawMarkerItem[]> {
  return new Promise((resolve) => {
    injectionSeq += 1
    const reqId = `gm-${injectionSeq}`
    const timer = setTimeout(() => {
      pendingInjections.delete(reqId)
      reportError("injection-degraded", "timed out waiting for the marker snapshot; /gm passed through unchanged")
      resolve([])
    }, GM_INJECTION_TIMEOUT_MS)
    pendingInjections.set(reqId, (markers) => {
      clearTimeout(timer)
      resolve(markers)
    })
    postToUi({ source: BRIDGE_SOURCE, type: "gm-request", payload: { cid, reqId } })
  })
}

function mergeMarkers(text: string, ours: readonly RawMarkerItem[]): string {
  const merged = mergeGetMarkerResponse(text, ours)
  if (!merged.ok) {
    reportError("injection-degraded", `failed to read /gm response: ${merged.reason}`)
    return text
  }
  return merged.text
}

async function finishGetMarker(
  caller: XMLHttpRequest,
  relay: XMLHttpRequest,
  url: string,
  injection: Promise<readonly RawMarkerItem[]>
): Promise<void> {
  const ours = await injection
  const original = relay.responseText
  const text = relay.status === 200 ? mergeMarkers(original, ours) : original
  const headers = new Map(headersOf(relay))
  if (text !== original) {
    // The injected body is longer than what the server described.
    headers.delete("content-length")
    headers.delete("content-encoding")
  }
  defineResponse(caller, url, relay.status, relay.statusText, text, headers)
  dispatchDone(caller, "load")
}

/**
 * The viewer calls /gm once, early. Re-issuing it ourselves lets the response
 * wait for the extension's snapshot without freezing the caller's XHR machinery.
 */
function relayGetMarker(
  caller: XMLHttpRequest,
  record: RequestRecord,
  body: Document | XMLHttpRequestBodyInit | null
): void {
  captureUserToken(record.url)
  const cid = new URL(record.url, window.location.href).searchParams.get("cid") ?? readCidFromLocation()
  const injection = requestInjection(cid)
  const relay = new XMLHttpRequest()
  nativeOpen.call(relay, record.method, record.url, true)
  for (const [name, value] of record.headers) nativeSetRequestHeader.call(relay, name, value)
  relay.addEventListener("load", () => {
    void finishGetMarker(caller, relay, record.url, injection)
  })
  relay.addEventListener("error", () => {
    failRequest(caller, record.url, "network error while re-issuing /gm")
  })
  nativeSend.call(relay, body)
}

XMLHttpRequest.prototype.open = function (
  this: XMLHttpRequest,
  method: string,
  url: string | URL,
  async?: boolean,
  username?: string | null,
  password?: string | null
): void {
  const href = typeof url === "string" ? url : url.href
  requests.set(this, { method, url: href, endpoint: classifyBwApiUrl(href), headers: [] })
  nativeOpen.call(this, method, url, async ?? true, username, password)
}

XMLHttpRequest.prototype.setRequestHeader = function (
  this: XMLHttpRequest,
  name: string,
  value: string
): void {
  requests.get(this)?.headers.push([name, value])
  nativeSetRequestHeader.call(this, name, value)
}

XMLHttpRequest.prototype.send = function (
  this: XMLHttpRequest,
  body?: Document | XMLHttpRequestBodyInit | null
): void {
  const record = requests.get(this)
  const payload = body ?? null
  switch (record?.endpoint) {
    case "pm":
      shortCircuitPutMarker(this, record.url)
      return
    case "gm":
      relayGetMarker(this, record, payload)
      return
    case "cri":
      watchCri(this, record.url)
      break
    case "content":
      watchContentCheck(this, record.url)
      break
    default:
      break
  }
  nativeSend.call(this, payload)
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input
  if (input instanceof URL) return input.href
  return input.url
}

window.fetch = function (
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  if (classifyBwApiUrl(urlOf(input)) === "pm") {
    // Blocking this is the intended behaviour, not a failure: the reader's marker is in
    // our own store either way. What is worth knowing is that the viewer took a path we
    // only guard defensively, which means it changed shape.
    reportError("injection-degraded", "/pm was requested through fetch and was blocked")
    return Promise.resolve(
      new Response(PM_SUCCESS_BODY, {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    )
  }
  return nativeFetch.call(window, input, init)
}

window.addEventListener("message", (event: MessageEvent) => {
  if (event.source !== window) return
  const data: unknown = event.data
  const message = parseUiToBridgeMessage(data)
  if (message === null) return
  const resolve = pendingInjections.get(message.payload.reqId)
  if (resolve === undefined) return
  pendingInjections.delete(message.payload.reqId)
  resolve(message.payload.markers)
})

function hasViewerGlobals(): boolean {
  const nfbr: unknown = Reflect.get(window, "NFBR")
  if (typeof nfbr !== "object" || nfbr === null) return false
  return Reflect.get(nfbr, "GlobalConfig") !== undefined
}

/** The patch stays installed either way; a missing NFBR only means it degrades to a pass-through. */
function waitForViewer(): void {
  const startedAt = Date.now()
  const poll = (): void => {
    if (hasViewerGlobals()) return
    if (Date.now() - startedAt > VIEWER_READY_TIMEOUT_MS) {
      reportError("startup", "NFBR.GlobalConfig never appeared; the viewer may have changed")
      return
    }
    setTimeout(poll, VIEWER_POLL_INTERVAL_MS)
  }
  poll()
}

waitForViewer()
