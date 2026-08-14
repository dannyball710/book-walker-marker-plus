import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, test } from "vitest"

import { MarkdownText } from "~/core/markdown/render"

/**
 * The promise this component makes is about the DOM the side panel ends up with,
 * so the assertions read the markup rather than the React tree. Text leaves are
 * wrapped by RubyText, which is why `<span>` shows up around plain text.
 */
function html(text: string): string {
  return renderToStaticMarkup(<MarkdownText text={text} />)
}

describe("MarkdownText element mapping", () => {
  test("renders a paragraph as <p>, not as raw text", () => {
    expect(html("a paragraph")).toBe('<div class="md"><p><span>a paragraph</span></p></div>')
  })

  test("maps heading level to the matching h tag", () => {
    expect(html("# Big")).toContain("<h1>")
    expect(html("### Small")).toContain("<h3>")
  })

  test("maps emphasis markers to <strong> and <em>", () => {
    expect(html("**bold** and *italic*")).toContain("<strong>")
    expect(html("**bold** and *italic*")).toContain("<em>")
  })

  test("keeps a fenced block's source verbatim and unparsed", () => {
    const markup = html("```ts\nconst a = **b**\n```")
    expect(markup).toContain("<pre><code>const a = **b**</code></pre>")
    expect(markup).not.toContain("<strong>")
  })

  test("renders inline code as <code> outside a <pre>", () => {
    expect(html("run `npm run dev` first")).toContain("<code>npm run dev</code>")
    expect(html("run `npm run dev` first")).not.toContain("<pre>")
  })

  test("nests a sub-list inside the parent <li>, not as a sibling list", () => {
    expect(html("- a\n  - a.1")).toContain("<ul><li><span>a</span><ul>")
  })

  test("keeps an ordered list's starting number", () => {
    expect(html("3. three\n4. four")).toContain('<ol start="3">')
  })

  test("renders blockquotes and horizontal rules as their own elements", () => {
    expect(html("> quoted")).toContain("<blockquote>")
    expect(html("---")).toContain("<hr/>")
  })

  test("splits a table into header and body cells", () => {
    const markup = html("| Name | Value |\n| --- | ---: |\n| a | 1 |")
    expect(markup).toContain("<thead><tr><th><span>Name</span></th>")
    expect(markup).toContain("<tbody><tr><td><span>a</span></td>")
    expect(markup).toContain('style="text-align:right"')
  })

  test("never emits markup for HTML written by the model", () => {
    const markup = html('<img src=x onerror="alert(1)">')
    expect(markup).not.toContain("<img")
    expect(markup).toContain("&lt;img")
  })
})

describe("MarkdownText ruby annotations", () => {
  test("renders ruby inside inline formatting instead of dropping either", () => {
    expect(html("**{漢字|かんじ}**")).toContain(
      "<strong><span><ruby>漢字<rt>かんじ</rt></ruby></span></strong>"
    )
  })

  test("applies ruby to text leaves in every block, not only paragraphs", () => {
    expect(html("# {漢字|かんじ}")).toContain("<ruby>漢字<rt>かんじ</rt></ruby>")
    expect(html("- {漢字|かんじ}")).toContain("<ruby>漢字<rt>かんじ</rt></ruby>")
    expect(html("| {漢字|かんじ} |\n| --- |\n| a |")).toContain(
      "<ruby>漢字<rt>かんじ</rt></ruby>"
    )
  })

  // Markdown claims `\{` first, so the ruby parser never sees its own escape;
  // both systems must still land on one literal brace.
  test("renders an escaped brace once, not as an annotation", () => {
    const markup = html("a \\{漢字|かんじ} b")
    expect(markup).not.toContain("<ruby>")
    expect(markup).toContain("{")
  })

  test("leaves the annotation syntax alone inside code, where it is literal", () => {
    expect(html("`{漢字|かんじ}`")).toContain("<code>{漢字|かんじ}</code>")
    expect(html("```\n{漢字|かんじ}\n```")).not.toContain("<ruby>")
  })
})

describe("MarkdownText links", () => {
  test("opens an http(s) link in a new tab without leaking the referrer", () => {
    const markup = html("[docs](https://example.com/a)")
    expect(markup).toContain(
      '<a href="https://example.com/a" target="_blank" rel="noreferrer">'
    )
  })

  test("drops a javascript: href but keeps the link text readable", () => {
    const markup = html("[click me](javascript:alert(1))")
    expect(markup).not.toContain("<a")
    expect(markup).not.toContain("javascript:")
    expect(markup).toContain("click me")
  })

  test("drops any other non-web scheme the model may produce", () => {
    expect(html("[x](data:text/html,<script>1</script>)")).not.toContain("<a")
    expect(html("[x](vbscript:msgbox)")).not.toContain("<a")
    expect(html("[x](/relative/path)")).not.toContain("<a")
  })
})

describe("MarkdownText mid-stream input", () => {
  const reply = [
    "# Heading",
    "",
    "text with **bold**, a [link](https://example.com) and {漢字|かんじ}.",
    "",
    "- first",
    "  - nested",
    "",
    "| Name | Value |",
    "| --- | --- |",
    "| a | 1 |",
    "",
    "> quoted",
    "",
    "```ts",
    "const a = 1",
    "```"
  ].join("\n")

  // The chat re-renders on every delta, so each prefix of a reply is a real input.
  test("renders every prefix of a streamed reply without throwing", () => {
    for (let end = 0; end <= reply.length; end += 1) {
      expect(() => html(reply.slice(0, end))).not.toThrow()
    }
  })

  test("renders the specific half-written constructs a stream stops inside", () => {
    expect(() => html("```ts\nconst a =")).not.toThrow()
    expect(() => html("[half a link](htt")).not.toThrow()
    expect(() => html("| Name | Value |\n| ---")).not.toThrow()
    expect(() => html("**unclosed")).not.toThrow()
    expect(() => html("{漢字|")).not.toThrow()
  })

  test("renders an empty reply as an empty container", () => {
    expect(html("")).toBe('<div class="md"></div>')
  })
})
