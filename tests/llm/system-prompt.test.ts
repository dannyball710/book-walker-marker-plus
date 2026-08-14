import { describe, expect, it } from "vitest"

import { buildSystemPrompt } from "~/llm/system-prompt"

const input = {
  bookTitle: "サンプル書籍",
  text: "これはテスト用の本文である。",
  memo: "「本文」は{本文|ほんぶん}と読む"
} as const

describe("buildSystemPrompt", () => {
  it("gives the model the passage, the note and the book so answers can be grounded", () => {
    const prompt = buildSystemPrompt(input)
    expect(prompt).toContain(input.text)
    expect(prompt).toContain(input.memo)
    expect(prompt).toContain(input.bookTitle)
  })

  it("teaches the ruby syntax the extension renders, and forbids parenthesised readings", () => {
    const prompt = buildSystemPrompt(input)
    expect(prompt).toContain("{漢字|かんじ}")
    expect(prompt.toLowerCase()).toContain("parenthes")
  })

  it("substitutes a placeholder for a blank note so the model is not fed an empty section", () => {
    const prompt = buildSystemPrompt({ ...input, memo: "   " })
    expect(prompt).toContain("not written a note")
    expect(prompt).not.toMatch(/<note>\s*<\/note>/)
  })

  it("keeps answers in the reader's language", () => {
    expect(buildSystemPrompt(input)).toContain("Traditional Chinese")
  })
})
