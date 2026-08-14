import {
  getBookContext,
  setPendingSelection
} from "~/background/marker-service"
import { handle, requireBody } from "~/background/result"
import type {
  PanelSelectionMessage,
  SelectionCapturedRequest
} from "~/core/messaging/protocol"

const handler = handle<SelectionCapturedRequest, null>(async (request) => {
  const { selection } = requireBody(request.body)
  const tabId = request.sender?.tab?.id

  // Started before any await: Chrome only honours open() while the user gesture
  // that produced the selection is still on the call stack.
  const opening =
    tabId === undefined ? null : chrome.sidePanel.open({ tabId })

  await setPendingSelection(selection)
  if (opening !== null) {
    try {
      await opening
    } catch (error) {
      console.warn("[bwm] sidePanel.open was rejected", error)
    }
  }

  const message: PanelSelectionMessage = {
    type: "panel/pending-selection",
    selection,
    context: await getBookContext(selection.cid)
  }
  try {
    await chrome.runtime.sendMessage(message)
  } catch (error) {
    // A panel that was closed at selection time is still mounting; it reads the
    // pending selection through selection-get instead.
    console.warn("[bwm] no side panel listening for the selection", error)
  }
  return null
})

export default handler
