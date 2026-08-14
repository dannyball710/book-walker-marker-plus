import type { ContentCommand } from "~/core/messaging/protocol"

const VIEWER_HOST = "viewer.bookwalker.jp"

async function findViewerTabId(): Promise<number | null> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  const viewer = tabs.find((tab) => tab.url !== undefined && tab.url.includes(VIEWER_HOST))
  return viewer?.id ?? null
}

/**
 * Only the content script can reach the MAIN-world bridge, so panel actions that must
 * touch the viewer are relayed through the active tab. Returns false when the viewer is
 * unreachable — no tab, or a tab whose content script is missing because it was open
 * before the extension loaded or survived a rebuild. Both need the same user action
 * (reload the viewer), so the caller reports one readable message instead of a raw
 * "Could not establish connection" from chrome.
 */
export async function sendToViewerTab(command: ContentCommand): Promise<boolean> {
  const tabId = await findViewerTabId()
  if (tabId === null) {
    return false
  }
  try {
    await chrome.tabs.sendMessage(tabId, command)
    return true
  } catch {
    return false
  }
}
