import { describe, expect, it } from "vitest"

import { extractSelectionContext } from "~/viewer/selection-context"

describe("extractSelectionContext", () => {
  it("returns a 50-character window containing the selected passage", () => {
    const before = "前".repeat(30)
    const after = "後".repeat(30)
    const context = extractSelectionContext(
      `${before}選択本文${after}`,
      "選択本文",
      30
    )

    expect(Array.from(context)).toHaveLength(50)
    expect(context).toBe(`${"前".repeat(23)}選択本文${"後".repeat(23)}`)
  })

  it("chooses the occurrence nearest the expected region offset", () => {
    expect(
      extractSelectionContext(
        "前の同文後のxxxxxxxxxx同文ABCDEFGHIJ",
        "同文",
        16,
        8
      )
    ).toBe("xxx同文ABC")
  })

  it("uses the other side to fill the window near a boundary", () => {
    const context = extractSelectionContext(
      `選択${"後".repeat(60)}`,
      "選択",
      0
    )

    expect(context).toBe(`選択${"後".repeat(48)}`)
  })

  it("counts astral characters as one character", () => {
    expect(extractSelectionContext("ab😀選択😺cd", "選択", 3, 6)).toBe(
      "b😀選択😺c"
    )
  })

  it("falls back to at most 50 selected characters when no wider match exists", () => {
    const selected = "選".repeat(60)
    expect(extractSelectionContext("別の本文", selected, 0)).toBe("選".repeat(50))
  })
})
