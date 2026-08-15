import { describe, expect, it } from "vitest"

import { selectedTextWithRuby } from "~/ui/logic/ruby-copy"

function rubySelection(): {
  readonly container: HTMLElement
  readonly selection: Selection
} {
  const container = {
    contains: () => true
  } as unknown as HTMLElement
  const ruby = {
    nodeType: 1,
    tagName: "RUBY",
    parentElement: container,
    getAttribute: (name: string) =>
      name === "data-bwm-ruby" ? "{漢字|かんじ}" : null
  } as unknown as Element
  const base = {
    nodeType: 3,
    parentElement: ruby
  } as unknown as Node
  const range = {
    startContainer: base,
    endContainer: base,
    commonAncestorContainer: base
  } as unknown as Range
  const selection = {
    rangeCount: 1,
    isCollapsed: false,
    getRangeAt: () => range
  } as unknown as Selection

  return { container, selection }
}

describe("selectedTextWithRuby", () => {
  it("copies a directly selected ruby as editable annotation syntax", () => {
    const { container, selection } = rubySelection()

    expect(selectedTextWithRuby(container, selection)).toBe("{漢字|かんじ}")
  })

  it("does not replace the browser clipboard for a collapsed selection", () => {
    const { container, selection } = rubySelection()
    const collapsed = {
      ...selection,
      isCollapsed: true
    } as unknown as Selection

    expect(selectedTextWithRuby(container, collapsed)).toBeNull()
  })
})
