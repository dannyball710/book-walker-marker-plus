import { describe, expect, it } from "vitest"

import { tooltipText } from "~/viewer/tooltip-text"

describe("tooltipText", () => {
  it("keeps only the content before the second line break", () => {
    expect(tooltipText("第一行\n第二行\n第三行\n第四行")).toBe(
      "第一行\n第二行"
    )
  })

  it("keeps shorter memos unchanged", () => {
    expect(tooltipText("只有一行")).toBe("只有一行")
    expect(tooltipText("第一行\n第二行")).toBe("第一行\n第二行")
  })

  it("treats CRLF as one line break", () => {
    expect(tooltipText("first\r\nsecond\r\nthird")).toBe("first\nsecond")
  })
})
