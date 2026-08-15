export type ChatRole = "user" | "assistant"

export interface ChatMessage {
  readonly id: string
  readonly role: ChatRole
  readonly content: string
  readonly createdAt: number
  /** model that produced this reply, for traceability */
  readonly model?: string
}

/**
 * What a conversation is about. A draft carries the passage itself because an unsaved
 * selection has no stored record to read it back from, and `key` identifies that
 * selection so moving to another one starts a new conversation instead of continuing
 * this one.
 */
export type ChatSubject =
  | {
      readonly kind: "marker"
      readonly markerId: string
      /** stable passage key used to carry a draft conversation across its first save */
      readonly key?: string
    }
  | {
      readonly kind: "draft"
      readonly key: string
      readonly text: string
      readonly memo: string
      readonly bookTitle: string
      readonly contextText?: string
    }

/**
 * Identity of a conversation. The panel and the port both hold a transcript and must
 * agree on when it is a different one, so the rule lives here rather than twice.
 */
export function chatSubjectKey(subject: ChatSubject): string {
  if (subject.kind === "draft") {
    return `passage:${subject.key}`
  }
  return subject.key === undefined
    ? `marker:${subject.markerId}`
    : `passage:${subject.key}`
}
