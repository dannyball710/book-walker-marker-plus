import { setPendingFocus } from "~/background/marker-service"
import type { PanelFocusRequest } from "~/background/message-types"
import { handle, requireBody } from "~/background/result"
import type { PanelFocusMessage } from "~/core/messaging/protocol"

const handler = handle<PanelFocusRequest, null>(async (request) => {
  const { marker } = requireBody(request.body)
  const tabId = request.sender?.tab?.id

  // Started before any await: Chrome only honours open() while the click that
  // triggered this message is still on the call stack.
  const opening =
    tabId === undefined ? null : chrome.sidePanel.open({ tabId })

  await setPendingFocus(marker)
  if (opening !== null) {
    try {
      await opening
    } catch (error) {
      console.warn("[bwm] sidePanel.open was rejected", error)
    }
  }

  const message: PanelFocusMessage = { type: "panel/focus-marker", marker }
  try {
    await chrome.runtime.sendMessage(message)
  } catch (error) {
    // A panel that was closed at click time is still mounting and cannot
    // receive this; it picks the marker up from PENDING_FOCUS_KEY instead.
    console.warn("[bwm] no side panel listening for panel/focus-marker", error)
  }
  return null
})

export default handler
