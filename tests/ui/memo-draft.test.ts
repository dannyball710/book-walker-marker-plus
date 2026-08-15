import { describe, expect, it } from "vitest"

import { appendMemo } from "~/ui/logic/memo-draft"

describe("appendMemo", () => {
  it("uses the answer as the first note", () => {
    expect(appendMemo("", "  explanation  ")).toBe("explanation")
  })

  it("appends without erasing an existing note", () => {
    expect(appendMemo("my thought  ", "model answer")).toBe(
      "my thought\n\nmodel answer"
    )
  })

  it("ignores an empty answer", () => {
    expect(appendMemo("keep this", "   ")).toBe("keep this")
  })
})
