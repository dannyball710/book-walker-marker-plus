import { createChatPortSession } from "~/background/chat-port"
import { runChatStream } from "~/background/chat-service"
import { CHAT_PORT_NAME } from "~/core/messaging/protocol"

function enableActionOpensPanel(): void {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error: unknown) => console.error("[bwm] sidePanel.setPanelBehavior failed", error))
}

chrome.runtime.onInstalled.addListener(enableActionOpensPanel)
chrome.runtime.onStartup.addListener(enableActionOpensPanel)

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== CHAT_PORT_NAME) {
    return
  }

  const session = createChatPortSession({
    post: (response) => port.postMessage(response),
    run: runChatStream
  })

  port.onMessage.addListener(session.onMessage)
  port.onDisconnect.addListener(session.onDisconnect)
})
