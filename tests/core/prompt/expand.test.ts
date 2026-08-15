import { describe, expect, test } from "vitest"

import { expandPrompt, type PromptVars } from "~/core/prompt/expand"

const VARS: PromptVars = {
  text: "テスト本文",
  memo: "{漢字|かんじ}",
  bookTitle: "サンプル書籍",
  responseLanguage: "English"
}

describe("expandPrompt", () => {
  test("substitutes every supported placeholder", () => {
    expect(
      expandPrompt(
        "《{{bookTitle}}》{{text}} / {{memo}} / {{responseLanguage}}",
        VARS
      )
    ).toBe("《サンプル書籍》テスト本文 / {漢字|かんじ} / English")
  })

  test("substitutes repeated placeholders", () => {
    expect(expandPrompt("{{text}}{{text}}", VARS)).toBe("テスト本文テスト本文")
  })

  test("tolerates whitespace inside the braces", () => {
    expect(expandPrompt("{{ text }} {{  bookTitle  }}", VARS)).toBe(
      "テスト本文 サンプル書籍"
    )
  })

  test("leaves an unknown placeholder verbatim", () => {
    expect(expandPrompt("{{foo}} {{text}}", VARS)).toBe("{{foo}} テスト本文")
  })

  test("leaves single braces alone", () => {
    expect(expandPrompt("{text} {{text}}", VARS)).toBe("{text} テスト本文")
  })

  test("does not rescan substituted values", () => {
    const vars: PromptVars = { ...VARS, memo: "{{text}}" }
    expect(expandPrompt("{{memo}}", vars)).toBe("{{text}}")
  })

  test("treats replacement patterns in a value as literal text", () => {
    const vars: PromptVars = { ...VARS, text: "$& $1 $$" }
    expect(expandPrompt("{{text}}", vars)).toBe("$& $1 $$")
  })

  test("returns a template without placeholders unchanged", () => {
    expect(expandPrompt("explain this", VARS)).toBe("explain this")
  })
})
