/**
 * Errors whose message is written for the user and may be shown verbatim.
 * Anything else reaching the side panel is replaced with fixed wording, so a
 * provider response can never put credentials on screen.
 */
export class ChatUserError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ChatUserError"
  }
}
