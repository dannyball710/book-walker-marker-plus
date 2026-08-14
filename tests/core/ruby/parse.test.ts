import { describe, expect, test } from "vitest"

import { parseRuby } from "~/core/ruby/parse"

describe("parseRuby — the rule table", () => {
  test("{漢字|かんじ} becomes a ruby segment", () => {
    expect(parseRuby("{漢字|かんじ}")).toEqual([
      { kind: "ruby", base: "漢字", rt: "かんじ" }
    ])
  })

  test("surrounding text stays as its own segments", () => {
    expect(parseRuby("abc{漢字|かんじ}def")).toEqual([
      { kind: "text", value: "abc" },
      { kind: "ruby", base: "漢字", rt: "かんじ" },
      { kind: "text", value: "def" }
    ])
  })

  test("a group without a separator is literal text", () => {
    expect(parseRuby("{漢字}")).toEqual([{ kind: "text", value: "{漢字}" }])
  })

  test("an empty base is literal text", () => {
    expect(parseRuby("{|かんじ}")).toEqual([{ kind: "text", value: "{|かんじ}" }])
  })

  test("an empty rt is literal text", () => {
    expect(parseRuby("{漢字|}")).toEqual([{ kind: "text", value: "{漢字|}" }])
  })

  test("\\{ escapes to a literal brace", () => {
    expect(parseRuby("\\{漢字|かんじ}")).toEqual([
      { kind: "text", value: "{漢字|かんじ}" }
    ])
  })

  test("an unclosed group is literal text", () => {
    expect(parseRuby("{漢字")).toEqual([{ kind: "text", value: "{漢字" }])
  })

  test("a nested group is literal text as a whole, inner group included", () => {
    expect(parseRuby("{a{b|c}|d}")).toEqual([
      { kind: "text", value: "{a{b|c}|d}" }
    ])
  })
})

describe("parseRuby — segment shape", () => {
  test("empty input yields no segments", () => {
    expect(parseRuby("")).toEqual([])
  })

  test("text around a rejected group merges into one segment", () => {
    expect(parseRuby("前{漢字}後")).toEqual([
      { kind: "text", value: "前{漢字}後" }
    ])
  })

  test("consecutive ruby groups keep no empty text between them", () => {
    expect(parseRuby("{一|いち}{二|に}")).toEqual([
      { kind: "ruby", base: "一", rt: "いち" },
      { kind: "ruby", base: "二", rt: "に" }
    ])
  })

  test("an escaped brace inside a group does not open a nested group", () => {
    expect(parseRuby("{a\\{b|c}")).toEqual([
      { kind: "ruby", base: "a{b", rt: "c" }
    ])
  })

  test("an escape still applies when the group is rejected", () => {
    expect(parseRuby("{a\\{b}")).toEqual([{ kind: "text", value: "{a{b}" }])
  })

  test("an escape still applies when the group is never closed", () => {
    expect(parseRuby("{a\\{b")).toEqual([{ kind: "text", value: "{a{b" }])
  })

  test("only the first separator splits base from rt", () => {
    expect(parseRuby("{a|b|c}")).toEqual([{ kind: "ruby", base: "a", rt: "b|c" }])
  })
})
