import { describe, expect, it } from "vitest"

import { chatSubjectKey, type ChatSubject } from "~/core/chat/types"

const passage = "epubcfi(/6/8!/4/2/10,/1:0,/1:7)"

describe("chatSubjectKey", () => {
  it("keeps the same conversation when a draft passage becomes a marker", () => {
    const draft: ChatSubject = {
      kind: "draft",
      key: passage,
      text: "本文",
      memo: "",
      bookTitle: "書籍"
    }
    const marker: ChatSubject = {
      kind: "marker",
      markerId: "marker-1",
      key: passage
    }

    expect(chatSubjectKey(marker)).toBe(chatSubjectKey(draft))
  })

  it("still isolates legacy marker subjects by marker id", () => {
    expect(chatSubjectKey({ kind: "marker", markerId: "marker-1" })).toBe(
      "marker:marker-1"
    )
  })
})
