import { marked, type MarkedToken, type Token, type Tokens } from "marked"

/** Convert a model reply into editable note text without leaking Markdown punctuation. */
export function markdownToPlainText(markdown: string): string {
  return renderBlocks(marked.lexer(markdown)).trim()
}

function asKnown(tokens: readonly Token[]): readonly MarkedToken[] {
  return tokens as readonly MarkedToken[]
}

function renderBlocks(tokens: readonly Token[]): string {
  return asKnown(tokens)
    .map(renderBlock)
    .filter((text) => text !== "")
    .join("\n\n")
}

function renderBlock(token: MarkedToken): string {
  switch (token.type) {
    case "heading":
    case "paragraph":
      return renderInlines(token.tokens)
    case "text":
      return renderText(token)
    case "code":
      return token.text
    case "blockquote":
      return renderBlocks(token.tokens)
    case "list":
      return renderList(token)
    case "table":
      return renderTable(token)
    case "hr":
      return "---"
    case "html":
      return token.raw
    default:
      return ""
  }
}

function renderInlines(tokens: readonly Token[]): string {
  return asKnown(tokens).map(renderInline).join("")
}

function renderInline(token: MarkedToken): string {
  switch (token.type) {
    case "text":
      return renderText(token)
    case "strong":
    case "em":
    case "del":
    case "link":
      return renderInlines(token.tokens)
    case "codespan":
    case "escape":
      return token.text
    case "br":
      return "\n"
    case "image":
      return token.text
    case "html":
      return token.raw
    default:
      return ""
  }
}

function renderText(token: Tokens.Text): string {
  return token.tokens === undefined ? token.text : renderInlines(token.tokens)
}

function renderList(token: Tokens.List): string {
  const start = token.start === "" ? 1 : token.start
  return token.items
    .map((item, index) => {
      const prefix = token.ordered ? `${start + index}.` : "-"
      const body = renderBlocks(item.tokens).replaceAll("\n", "\n  ")
      return `${prefix} ${body}`
    })
    .join("\n")
}

function renderTable(token: Tokens.Table): string {
  const header = token.header.map((cell) => renderInlines(cell.tokens)).join(" | ")
  const rows = token.rows.map((row) =>
    row.map((cell) => renderInlines(cell.tokens)).join(" | ")
  )
  return [header, ...rows].join("\n")
}
