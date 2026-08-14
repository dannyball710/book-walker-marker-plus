/**
 * Renders LLM markdown by walking marked's token tree into React elements.
 * No HTML string is ever produced, so model output cannot become markup in a
 * page that holds `chrome.*` privileges. Text leaves keep going through the
 * `{漢字|かんじ}` annotation renderer, so both syntaxes compose.
 */

import { marked, type MarkedToken, type Token, type Tokens } from "marked"
import { Fragment, type CSSProperties, type ReactNode } from "react"

import { RubyText } from "~/core/ruby/render"

const HEADING_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6"] as const

/** Only fetchable web schemes survive; `javascript:` and friends lose the href. */
const SAFE_PROTOCOLS: readonly string[] = ["http:", "https:"]

export function MarkdownText(props: { readonly text: string }): JSX.Element {
  return <div className="md">{renderBlocks(marked.lexer(props.text))}</div>
}

/**
 * The lexer types children as `Token`, whose `Tokens.Generic` arm exists for
 * registered extensions. This module registers none, so the union is closed.
 */
function asKnown(tokens: readonly Token[]): readonly MarkedToken[] {
  return tokens as readonly MarkedToken[]
}

function renderBlocks(tokens: readonly Token[]): ReactNode {
  return asKnown(tokens).map(renderBlock)
}

function renderInlines(tokens: readonly Token[]): ReactNode {
  return asKnown(tokens).map(renderInline)
}

function renderBlock(token: MarkedToken, key: number): ReactNode {
  switch (token.type) {
    case "heading": {
      const Tag = HEADING_TAGS[Math.min(Math.max(token.depth, 1), 6) - 1] ?? "h6"
      return <Tag key={key}>{renderInlines(token.tokens)}</Tag>
    }
    case "paragraph":
      return <p key={key}>{renderInlines(token.tokens)}</p>
    case "code":
      return (
        <pre key={key}>
          <code>{token.text}</code>
        </pre>
      )
    case "blockquote":
      return <blockquote key={key}>{renderBlocks(token.tokens)}</blockquote>
    case "list":
      return renderList(token, key)
    case "table":
      return renderTable(token, key)
    case "hr":
      return <hr key={key} />
    // A `text` block carries the content of a tight list item.
    case "text":
      return renderText(token, key)
    // Raw HTML is shown as the literal source it came from, never parsed.
    case "html":
      return <Fragment key={key}>{token.raw}</Fragment>
    // `space` is inter-block padding and `def` is a link definition; neither
    // has a rendered form, and inline tokens never reach block position.
    default:
      return null
  }
}

function renderInline(token: MarkedToken, key: number): ReactNode {
  switch (token.type) {
    case "text":
      return renderText(token, key)
    case "strong":
      return <strong key={key}>{renderInlines(token.tokens)}</strong>
    case "em":
      return <em key={key}>{renderInlines(token.tokens)}</em>
    case "del":
      return <del key={key}>{renderInlines(token.tokens)}</del>
    case "codespan":
      return <code key={key}>{token.text}</code>
    case "link":
      return renderLink(token, key)
    case "br":
      return <br key={key} />
    // A backslash escape resolves to one literal character, not annotation input.
    case "escape":
      return <Fragment key={key}>{token.text}</Fragment>
    // Remote images would let model output pull a URL from the panel, so only
    // the alt text is kept.
    case "image":
      return <RubyText key={key} text={token.text} />
    case "html":
      return <Fragment key={key}>{token.raw}</Fragment>
    default:
      return null
  }
}

function renderText(token: Tokens.Text, key: number): ReactNode {
  if (token.tokens !== undefined) {
    return <Fragment key={key}>{renderInlines(token.tokens)}</Fragment>
  }
  return <RubyText key={key} text={token.text} />
}

function renderLink(token: Tokens.Link, key: number): ReactNode {
  const href = safeHref(token.href)
  if (href === null) {
    return <Fragment key={key}>{renderInlines(token.tokens)}</Fragment>
  }
  return (
    <a key={key} href={href} target="_blank" rel="noreferrer">
      {renderInlines(token.tokens)}
    </a>
  )
}

function renderList(token: Tokens.List, key: number): ReactNode {
  const items = token.items.map(renderListItem)
  if (token.ordered) {
    const start = token.start === "" ? 1 : token.start
    return (
      <ol key={key} start={start}>
        {items}
      </ol>
    )
  }
  return <ul key={key}>{items}</ul>
}

function renderListItem(item: Tokens.ListItem, key: number): JSX.Element {
  return (
    <li key={key}>
      {item.task && (
        <input
          type="checkbox"
          className="md-task"
          checked={item.checked === true}
          disabled
          readOnly
        />
      )}
      {renderBlocks(item.tokens)}
    </li>
  )
}

function renderTable(token: Tokens.Table, key: number): ReactNode {
  return (
    <table key={key}>
      <thead>
        <tr>
          {token.header.map((cell, index) => (
            <th key={index} style={alignStyle(cell.align)}>
              {renderInlines(cell.tokens)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {token.rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.map((cell, index) => (
              <td key={index} style={alignStyle(cell.align)}>
                {renderInlines(cell.tokens)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function alignStyle(align: Tokens.TableCell["align"]): CSSProperties | undefined {
  if (align === null) return undefined
  return { textAlign: align }
}

/** Normalised absolute URL, or null when the scheme is not safe to link to. */
function safeHref(href: string): string | null {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return null
  }
  return SAFE_PROTOCOLS.includes(url.protocol) ? url.href : null
}
