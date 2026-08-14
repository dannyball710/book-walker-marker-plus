import { isValidElement, type ReactNode } from "react"
import { describe, expect, test } from "vitest"

import { RubyText } from "~/core/ruby/render"

interface ElementProps {
  readonly children?: ReactNode
}

/**
 * Flattens the returned tree into `tag[child,child]` so the assertions read as the
 * markup contract. Fragments are transparent; they only carry the segment keys.
 */
function shapeOf(node: ReactNode): string {
  if (typeof node === "string") return node
  if (typeof node === "number") return String(node)
  if (Array.isArray(node)) {
    return node
      .map(shapeOf)
      .filter((part) => part !== "")
      .join(",")
  }
  if (isValidElement<ElementProps>(node)) {
    const children = shapeOf(node.props.children ?? null)
    if (typeof node.type !== "string") return children
    return children === "" ? node.type : `${node.type}[${children}]`
  }
  return ""
}

describe("RubyText", () => {
  test("renders a ruby segment as <ruby>base<rt>reading</rt></ruby>", () => {
    expect(shapeOf(RubyText({ text: "{漢字|かんじ}" }))).toBe(
      "span[ruby[漢字,rt[かんじ]]]"
    )
  })

  test("keeps base and reading in that order, never swapped", () => {
    const shape = shapeOf(RubyText({ text: "{一|いち}" }))
    expect(shape.indexOf("一")).toBeLessThan(shape.indexOf("rt["))
  })

  test("renders plain text without any ruby element", () => {
    expect(shapeOf(RubyText({ text: "ただの文" }))).toBe("span[ただの文]")
  })

  test("keeps surrounding text next to the ruby, in document order", () => {
    expect(shapeOf(RubyText({ text: "序{漢字|かんじ}後" }))).toBe(
      "span[序,ruby[漢字,rt[かんじ]],後]"
    )
  })

  test("never leaks the annotation syntax into the output", () => {
    const shape = shapeOf(RubyText({ text: "{漢字|かんじ}" }))
    expect(shape).not.toContain("{")
    expect(shape).not.toContain("|")
  })

  test("wraps everything in a single span", () => {
    expect(RubyText({ text: "序{漢字|かんじ}" }).type).toBe("span")
  })
})
