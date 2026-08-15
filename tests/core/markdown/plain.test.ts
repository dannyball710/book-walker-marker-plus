import { describe, expect, it } from "vitest"

import { markdownToPlainText } from "~/core/markdown/plain"

describe("markdownToPlainText", () => {
  it("keeps readable structure while removing presentation syntax", () => {
    expect(
      markdownToPlainText(
        "## Meaning\n\nThis is **important** and [documented](https://example.com).\n\n- First\n- Second"
      )
    ).toBe("Meaning\n\nThis is important and documented.\n\n- First\n- Second")
  })

  it("preserves ruby notation for marker notes", () => {
    expect(markdownToPlainText("Read `{雰囲気|ふんいき}`.")).toBe(
      "Read {雰囲気|ふんいき}."
    )
  })
})
