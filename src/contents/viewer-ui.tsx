/**
 * ISOLATED-world UI: relays bridge messages to background, hides the viewer's
 * own marker dialogs and draws the hover tooltip over the native highlights.
 * No storage and no LLM work happens here.
 */
import { sendToBackground } from "@plasmohq/messaging"
import type { PlasmoCSConfig, PlasmoGetStyle } from "plasmo"
import { useSyncExternalStore } from "react"

import type { BgResult, PanelFocusRequest } from "~/background/message-types"
import { fontProfileOf } from "~/core/bwapi/urls"
import { t } from "~/core/i18n"
import { toRawMarkerItem } from "~/core/marker/codec"
import type {
  BookContext,
  BwMarker,
  FontProfile,
  FontSize,
  RawMarkerItem,
  SelectionCaptured
} from "~/core/marker/types"
import type {
  BookContextRequest,
  BridgeError,
  ContentCommand,
  MarkerListRequest,
  MarkerListResponse,
  SelectionCapturedRequest,
  UiToBridgeMessage
} from "~/core/messaging/protocol"
import { BG_MESSAGE, BRIDGE_SOURCE } from "~/core/messaging/protocol"
import { RubyText } from "~/core/ruby/render"

import { parseBridgeToUiMessage, parseContentCommand } from "~/viewer/bridge-protocol"
import type { HighlightRect } from "~/viewer/highlight-index"
import {
  findMarkerAtRegion,
  hitTestRegion,
  regionIndexFromRectId,
  unpaintedRegions
} from "~/viewer/highlight-index"
import { opaqueFillFor } from "~/viewer/marker-color"
import { readCidFromLocation, readViewerFontSize } from "~/viewer/page-state"

// Mirrors viewer-bridge.ts: `*` covers the version segment, so no version is hard-coded.
export const config: PlasmoCSConfig = {
  matches: ["https://viewer.bookwalker.jp/*/viewer.html*"],
  run_at: "document_start"
}

const HOVER_THROTTLE_MS = 30
const MARKER_REFRESH_INTERVAL_MS = 2000
const TOOLTIP_MAX_WIDTH = 320
const TOOLTIP_OFFSET = 14
const TOOLTIP_ASSUMED_HEIGHT = 160

/** jQuery UI measures its dialogs, so they must keep their size. */
const HIDE_NATIVE_UI_CSS = `
.markerRegisterDialog,
.dialogTableOfMarkers,
.ui-dialog:has(.markerRegisterDialog),
.ui-dialog:has(.dialogTableOfMarkers) {
  opacity: 0 !important;
  pointer-events: none !important;
}`

interface TooltipState {
  readonly markerId: string
  readonly memo: string
  readonly x: number
  readonly y: number
}

let bookContext: BookContext | null = null
let fontSize: FontSize = readViewerFontSize()
let profile: FontProfile = fontProfileOf(fontSize, "default")
let markers: readonly BwMarker[] = []
let highlightRects: readonly HighlightRect[] = []
/**
 * Detached copies of every highlight the viewer has drawn this session, keyed by region
 * index. A selection is painted rect by rect while the reader drags, so by the time they
 * save, the geometry of exactly the region indexes the new marker owns has been seen —
 * which is the only way to draw it without the pagination map, and that is encrypted
 * The group is remembered by id because the viewer rebuilds the element.
 */
const geometry = new Map<number, { readonly groupId: string; readonly node: SVGRectElement }>()
/** Region indexes of markers deleted this session; the viewer still has them in memory. */
const deleted = new Set<number>()
/** Set on the rects we draw, so a reconcile can tell them from the viewer's own. */
const OURS_ATTR = "data-bwm"
/** Where the press that might become a marker tap landed, null once it is spent. */
let pressedMarkerId: string | null = null
let lastMoveAt = 0
let lastRefreshAt = 0
let reconcileScheduled = false
let trailingTimer: ReturnType<typeof setTimeout> | null = null
let loadSeq = 0

interface UiState {
  readonly tooltip: TooltipState | null
  readonly alert: string | null
}

let uiState: UiState = { tooltip: null, alert: null }
const uiSubscribers = new Set<() => void>()

function setUiState(next: UiState): void {
  uiState = next
  for (const notify of uiSubscribers) notify()
}

function subscribeUi(onChange: () => void): () => void {
  uiSubscribers.add(onChange)
  return () => {
    uiSubscribers.delete(onChange)
  }
}

function getUiState(): UiState {
  return uiState
}

function publishTooltip(next: TooltipState | null): void {
  if (next === null && uiState.tooltip === null) return
  setUiState({ ...uiState, tooltip: next })
}

function publishAlert(alert: string | null): void {
  if (alert === uiState.alert) return
  setUiState({ ...uiState, alert })
}

/**
 * Only a failure the reader would otherwise misread is shown, and only one can happen
 * here: a drag that silently produced nothing. Everything they write goes through the
 * side panel, which reports its own failures where they typed — the bridge never holds
 * their words. Degraded injection and startup problems stay in the console; nagging
 * about those trains the bar to be ignored. The raw reason stays out of the bar; it is
 * a diagnostic, and it is already logged.
 */
function alertFor(error: BridgeError): string | null {
  switch (error.kind) {
    case "selection-failed":
      return t("viewerSelectionFailed")
    case "injection-degraded":
    case "startup":
      return null
    default:
      return null
  }
}

function postToBridge(message: UiToBridgeMessage): void {
  window.postMessage(message, window.location.origin)
}

function warn(reason: string, error?: unknown): void {
  console.warn(`[bwm] ${reason}`, error)
}

/** Background never rejects; it answers with an envelope that must be opened. */
function unwrap<T>(result: BgResult<T>): T {
  if (!result.ok) throw new Error(result.error)
  return result.data
}

async function loadMarkers(cid: string): Promise<readonly BwMarker[]> {
  const seq = (loadSeq += 1)
  const result = await sendToBackground<MarkerListRequest, BgResult<MarkerListResponse>>({
    name: BG_MESSAGE.markerList,
    body: { query: { bookId: cid } }
  })
  const loaded = unwrap(result).markers
  // A slower earlier load must not overwrite a newer snapshot.
  if (seq === loadSeq) markers = loaded
  return loaded
}

function refreshMarkers(): void {
  const cid = bookContext?.cid ?? readCidFromLocation()
  if (cid === "") return
  const now = Date.now()
  if (now - lastRefreshAt < MARKER_REFRESH_INTERVAL_MS) return
  lastRefreshAt = now
  loadMarkers(cid)
    .then(reconcileHighlights)
    .catch((error: unknown) => warn("could not refresh markers", error))
}

function relayBookContext(context: BookContext): void {
  sendToBackground<BookContextRequest, BgResult<unknown>>({
    name: BG_MESSAGE.bookContext,
    body: { context }
  })
    .then(unwrap)
    .catch((error: unknown) => warn("could not relay the book context", error))
}

function applyBookContext(context: BookContext): void {
  bookContext = context
  fontSize = context.sfs
  profile = fontProfileOf(context.sfs, context.sff)
  relayBookContext(context)
  refreshMarkers()
}

/**
 * The viewer reflows in place on a font change, so nothing reloads. Background keys
 * the /ric backfill off the profile in the context it holds, so it has to be told.
 */
function syncFontProfile(): void {
  const next = readViewerFontSize()
  if (next === fontSize) return
  fontSize = next
  profile = fontProfileOf(next, bookContext?.sff ?? "default")
  if (bookContext === null) return
  bookContext = { ...bookContext, sfs: next }
  relayBookContext(bookContext)
}

function relaySelection(selection: SelectionCaptured): void {
  sendToBackground<SelectionCapturedRequest, BgResult<unknown>>({
    name: BG_MESSAGE.selectionCaptured,
    body: { selection }
  })
    .then(unwrap)
    .catch((error: unknown) => warn("could not relay the selection", error))
}

/**
 * Answers the bridge's /gm hold, which only budgets 1500 ms. The profile comes from
 * localStorage and is already known at document_start, so there is nothing to wait for.
 */
async function answerGmRequest(cid: string, reqId: string): Promise<void> {
  const items: RawMarkerItem[] = []
  try {
    for (const marker of await loadMarkers(cid)) {
      const item = toRawMarkerItem(marker, profile)
      if (item !== null) items.push(item)
    }
  } catch (error) {
    warn("no marker snapshot for /gm injection", error)
  }
  postToBridge({
    source: BRIDGE_SOURCE,
    type: "gm-response",
    payload: { reqId, markers: items }
  })
}

/** The group a copy came from, wherever the viewer has since rebuilt it. */
function groupById(groupId: string): Element | null {
  return document.querySelector(`#pageHighlight [id="${CSS.escape(groupId)}"]`)
}

function isOurs(rect: Element): boolean {
  return rect.hasAttribute(OURS_ATTR)
}

/**
 * The opacity the viewer's highlight layer carries, which its own fills are already
 * compensated for. Read every pass rather than assumed, so a viewer that changes it
 * moves our colours with it instead of leaving them subtly off.
 */
function layerOpacityOf(container: Element): number {
  const layer = container.querySelector("svg")
  if (layer === null) return 1
  const opacity = Number(window.getComputedStyle(layer).opacity)
  return Number.isFinite(opacity) ? opacity : 1
}

/** What we want drawn that the viewer is not: region index → the fill to paint. */
function ourDesiredRects(
  viewerDrawn: ReadonlySet<number>,
  layerOpacity: number
): ReadonlyMap<number, string> {
  const desired = new Map<number, string>()
  for (const marker of markers) {
    const fill = opaqueFillFor(marker.color, layerOpacity)
    for (const regionIndex of unpaintedRegions(marker, profile, viewerDrawn)) {
      if (geometry.has(regionIndex)) desired.set(regionIndex, fill)
    }
  }
  return desired
}

/**
 * Brings `#pageHighlight` in line with the marker store, and does it again on every
 * change to it, which is what this has to be.
 *
 * The viewer owns that element: it reads the marker list once at load, keeps it in
 * memory, and repaints from that memory whenever the page changes — measured, a page
 * turn drops every `highlight_group_*` and rebuilds it under the same id. So a marker
 * drawn once is erased by the next turn, and a deleted marker the viewer still
 * remembers is drawn again. Neither can be fixed by acting once; both are fixed by
 * reconciling every time.
 *
 * It writes only real differences, so the mutations it makes settle on the next pass
 * instead of feeding the observer that triggered it.
 */
function reconcileHighlights(): void {
  // A font change re-lays out the highlights, so this is where it becomes visible.
  syncFontProfile()
  const container = document.querySelector("#pageHighlight")
  if (container === null) {
    highlightRects = []
    return
  }

  const viewerDrawn = new Set<number>()
  const ours = new Map<number, Element>()
  for (const rect of container.querySelectorAll('rect[id^="highlight_"]')) {
    const regionIndex = regionIndexFromRectId(rect.id)
    if (regionIndex === null) continue
    if (isOurs(rect)) {
      ours.set(regionIndex, rect)
      continue
    }
    if (deleted.has(regionIndex)) {
      // The viewer redraws from its own memory, which no delete of ours can reach.
      rect.remove()
      continue
    }
    viewerDrawn.add(regionIndex)
    const group = rect.parentElement
    if (rect instanceof SVGRectElement && group !== null && group.id !== "") {
      geometry.set(regionIndex, { groupId: group.id, node: rect.cloneNode(false) as SVGRectElement })
    }
  }

  const desired = ourDesiredRects(viewerDrawn, layerOpacityOf(container))
  for (const [regionIndex, rect] of ours) {
    const fill = desired.get(regionIndex)
    if (fill === undefined || rect.getAttribute("fill") !== fill) rect.remove()
  }
  for (const [regionIndex, fill] of desired) {
    const existing = ours.get(regionIndex)
    if (existing !== undefined && existing.getAttribute("fill") === fill) continue
    const drawn = geometry.get(regionIndex)
    if (drawn === undefined) continue
    // Only into a group the viewer currently has on the page. It builds one per visible
    // page, so a group being there is the page it belongs to being there — which is what
    // keeps a marker from being drawn over another page's text.
    const group = groupById(drawn.groupId)
    if (group === null) continue
    const rect = drawn.node.cloneNode(false) as SVGRectElement
    rect.setAttribute("fill", fill)
    rect.setAttribute(OURS_ATTR, "")
    group.appendChild(rect)
  }

  const next: HighlightRect[] = []
  for (const rect of container.querySelectorAll('rect[id^="highlight_"]')) {
    const regionIndex = regionIndexFromRectId(rect.id)
    if (regionIndex === null) continue
    const box = rect.getBoundingClientRect()
    next.push({
      regionIndex,
      box: { left: box.left, top: box.top, right: box.right, bottom: box.bottom }
    })
  }
  highlightRects = next
}

function scheduleReconcile(): void {
  if (reconcileScheduled) return
  reconcileScheduled = true
  requestAnimationFrame(() => {
    reconcileScheduled = false
    reconcileHighlights()
  })
}

function markerAt(x: number, y: number): BwMarker | null {
  const regionIndex = hitTestRegion(highlightRects, x, y)
  if (regionIndex === null) return null
  return findMarkerAtRegion(markers, regionIndex, profile)
}

function onMouseMove(event: Event): void {
  if (!(event instanceof MouseEvent)) return
  const now = performance.now()
  if (now - lastMoveAt < HOVER_THROTTLE_MS) {
    // Trailing edge: the cursor often stops right after entering a highlight, and
    // dropping that last sample would leave the tooltip hidden until it moves again.
    const { clientX, clientY } = event
    if (trailingTimer !== null) clearTimeout(trailingTimer)
    trailingTimer = setTimeout(() => {
      trailingTimer = null
      lastMoveAt = performance.now()
      showTooltipAt(clientX, clientY)
    }, HOVER_THROTTLE_MS)
    return
  }
  if (trailingTimer !== null) {
    clearTimeout(trailingTimer)
    trailingTimer = null
  }
  lastMoveAt = now
  showTooltipAt(event.clientX, event.clientY)
}

function showTooltipAt(x: number, y: number): void {
  const marker = markerAt(x, y)
  if (marker === null || marker.memo === "") {
    publishTooltip(null)
    return
  }
  publishTooltip({ markerId: marker.id, memo: marker.memo, x, y })
}

function claim(event: MouseEvent): void {
  event.preventDefault()
  event.stopImmediatePropagation()
}

/**
 * A press that lands on one of our markers takes the whole gesture, press included.
 *
 * Measured on the viewer: it starts selecting text from `mousedown` on `#renderer`, so
 * letting the press through and only swallowing the release still leaves the reader
 * watching their marker turn into a selection. The cost is that a drag cannot *begin*
 * inside an existing marker — beginning outside one and dragging across it is untouched,
 * which is what keeps overlapping passages markable.
 */
function onPress(event: Event): void {
  if (!(event instanceof MouseEvent)) return
  const marker = markerAt(event.clientX, event.clientY)
  pressedMarkerId = marker?.id ?? null
  if (marker !== null) claim(event)
}

/** The release half of a press we already claimed; it must not reach the viewer either. */
function onRelease(event: Event): void {
  if (!(event instanceof MouseEvent)) return
  if (pressedMarkerId === null) return
  claim(event)
}

function onClick(event: Event): void {
  if (!(event instanceof MouseEvent)) return
  const markerId = pressedMarkerId
  pressedMarkerId = null
  if (markerId === null) return
  claim(event)
  // chrome.sidePanel.open() needs the user gesture's call stack: never await first.
  sendToBackground<PanelFocusRequest, BgResult<unknown>>({
    name: BG_MESSAGE.panelFocus,
    body: { markerId }
  })
    .then(unwrap)
    .catch((error: unknown) => warn("could not focus the side panel", error))
}

function waitForElement(selector: string, onFound: (element: Element) => void): void {
  const existing = document.querySelector(selector)
  if (existing !== null) {
    onFound(existing)
    return
  }
  const observer = new MutationObserver(() => {
    const found = document.querySelector(selector)
    if (found === null) return
    observer.disconnect()
    onFound(found)
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })
}

function attachHover(renderer: Element): void {
  new MutationObserver(scheduleReconcile).observe(renderer, {
    childList: true,
    subtree: true
  })
  renderer.addEventListener("mousemove", onMouseMove, { passive: true })
  renderer.addEventListener("mouseleave", () => {
    if (trailingTimer !== null) {
      clearTimeout(trailingTimer)
      trailingTimer = null
    }
    publishTooltip(null)
  })
  window.addEventListener("resize", scheduleReconcile)
  // The side panel writes markers; coming back to the page is when they matter.
  window.addEventListener("focus", refreshMarkers)
  scheduleReconcile()
}

/**
 * The viewer keeps its own marker list in memory and redraws from it, so a deleted
 * marker comes back on the next page turn unless every redraw is told to drop it.
 */
function removeHighlight(markerId: string): void {
  const marker = markers.find((candidate) => candidate.id === markerId)
  // The marker is already gone from storage, so drop it locally whether or not
  // its rects can be found; otherwise hover keeps offering a deleted note.
  markers = markers.filter((candidate) => candidate.id !== markerId)
  publishTooltip(null)

  const locator = marker?.locator.byProfile[profile]
  if (locator === undefined) {
    warn(`no highlight to unpaint for marker ${markerId} in profile ${profile}`)
    return
  }
  for (let index = locator.sidx; index <= locator.eidx; index += 1) deleted.add(index)
  reconcileHighlights()
}

function handleContentCommand(command: ContentCommand): void {
  switch (command.type) {
    case "content/refresh-markers":
      // An explicit request must not be swallowed by the focus-refresh throttle.
      lastRefreshAt = 0
      refreshMarkers()
      return
    case "content/remove-highlight":
      removeHighlight(command.markerId)
      return
    default:
      return
  }
}

function hideNativeMarkerUi(): void {
  const style = document.createElement("style")
  style.textContent = HIDE_NATIVE_UI_CSS
  document.documentElement.appendChild(style)
}

window.addEventListener("message", (event: MessageEvent) => {
  if (event.source !== window) return
  const data: unknown = event.data
  const message = parseBridgeToUiMessage(data)
  if (message === null) return
  switch (message.type) {
    case "book-context":
      applyBookContext(message.payload)
      return
    case "selection":
      relaySelection(message.payload)
      return
    case "gm-request":
      void answerGmRequest(message.payload.cid, message.payload.reqId)
      return
    case "bridge-error":
      warn(`bridge: ${message.payload.reason}`)
      publishAlert(alertFor(message.payload))
      return
    default:
      return
  }
})

chrome.runtime.onMessage.addListener((message: unknown) => {
  const command = parseContentCommand(message)
  if (command === null) return
  handleContentCommand(command)
})

/**
 * Registered here rather than alongside the hover listeners, and this is the whole point
 * of the split: among listeners on the same node in the same phase the browser keeps
 * registration order, and the viewer registers its own during page load. Waiting for
 * `#renderer` to exist would mean registering after it, so its handler for a tap on a
 * marker would run first and open the dialog before we could stop the event.
 *
 * They no-op until there are highlights to hit, so running from document_start is free.
 */
function interceptMarkerTaps(): void {
  document.addEventListener("pointerdown", onPress, true)
  document.addEventListener("mousedown", onPress, true)
  document.addEventListener("pointerup", onRelease, true)
  document.addEventListener("mouseup", onRelease, true)
  document.addEventListener("click", onClick, true)
}

hideNativeMarkerUi()
interceptMarkerTaps()
waitForElement("#renderer", attachHover)

export const getStyle: PlasmoGetStyle = () => {
  const style = document.createElement("style")
  style.textContent = `
.bwm-tooltip {
  position: fixed;
  z-index: 2147483647;
  pointer-events: none;
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(28, 28, 30, 0.96);
  color: #fff;
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
}
.bwm-tooltip rt {
  font-size: 0.6em;
  opacity: 0.85;
}
.bwm-alert {
  position: fixed;
  z-index: 2147483647;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 12px;
  align-items: flex-start;
  max-width: 480px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(158, 27, 62, 0.97);
  color: #fff;
  font-size: 13px;
  line-height: 1.6;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
}
.bwm-alert button {
  flex: none;
  border: 0;
  border-radius: 4px;
  padding: 2px 8px;
  background: rgba(255, 255, 255, 0.18);
  color: inherit;
  font: inherit;
  cursor: pointer;
}`
  return style
}

function Tooltip(props: { readonly state: TooltipState }): JSX.Element {
  const { state } = props
  const flipX = state.x + TOOLTIP_OFFSET + TOOLTIP_MAX_WIDTH > window.innerWidth
  const flipY = state.y + TOOLTIP_OFFSET + TOOLTIP_ASSUMED_HEIGHT > window.innerHeight
  return (
    <div
      className="bwm-tooltip"
      style={{
        left: flipX ? state.x - TOOLTIP_OFFSET : state.x + TOOLTIP_OFFSET,
        top: flipY ? state.y - TOOLTIP_OFFSET : state.y + TOOLTIP_OFFSET,
        transform: `translate(${flipX ? "-100%" : "0"}, ${flipY ? "-100%" : "0"})`,
        maxWidth: TOOLTIP_MAX_WIDTH
      }}>
      <RubyText text={state.memo} />
    </div>
  )
}

export default function ViewerUi(): JSX.Element {
  const state = useSyncExternalStore(subscribeUi, getUiState, getUiState)
  return (
    <>
      {state.tooltip !== null && <Tooltip state={state.tooltip} />}
      {state.alert !== null && (
        <div className="bwm-alert" role="alert">
          <span>{state.alert}</span>
          <button type="button" onClick={() => publishAlert(null)}>
            {t("commonClose")}
          </button>
        </div>
      )}
    </>
  )
}
