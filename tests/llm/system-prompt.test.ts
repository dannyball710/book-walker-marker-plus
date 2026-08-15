import { describe, expect, it } from "vitest"

import { buildSystemPrompt } from "~/llm/system-prompt"

const input = {
  bookTitle: "サンプル書籍",
  text: "これはテスト用の本文である。",
  memo: "「本文」は{本文|ほんぶん}と読む",
  responseLanguage: "English"
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

  it("keeps ruby annotations out of Markdown code where they render literally", () => {
    const prompt = buildSystemPrompt(input)
    expect(prompt).toContain("fenced code block")
    expect(prompt).toContain("without backticks")
  })

  it("keeps okurigana outside the annotated kanji", () => {
    const prompt = buildSystemPrompt(input)
    expect(prompt).toContain("{出会|であ}った")
    expect(prompt).toContain("never {出会った|であった}")
  })

  it("labels the stored surrounding characters as context rather than highlighted text", () => {
    const prompt = buildSystemPrompt({
      ...input,
      contextText: "直前の十文字これはテスト用の本文である。直後の十文字"
    })

    expect(prompt).toContain(
      "<context>\n直前の十文字これはテスト用の本文である。直後の十文字\n</context>"
    )
    expect(prompt).toContain("exact highlight")
  })

  it("substitutes a placeholder for a blank note so the model is not fed an empty section", () => {
    const prompt = buildSystemPrompt({ ...input, memo: "   " })
    expect(prompt).toContain("not written a note")
    expect(prompt).not.toMatch(/<note>\s*<\/note>/)
  })

  it("uses the configured response language", () => {
    expect(
      buildSystemPrompt({ ...input, responseLanguage: "Brazilian Portuguese" })
    ).toContain("Answer in Brazilian Portuguese")
  })
})
