/**
 * Parser for the `{base|reading}` ruby annotation syntax used in marker memos.
 */

export type RubySegment =
  | { readonly kind: "text"; readonly value: string }
  | { readonly kind: "ruby"; readonly base: string; readonly rt: string }

const OPEN = "{"
const CLOSE = "}"
const SEPARATOR = "|"
const ESCAPE = "\\"

export function parseRuby(input: string): readonly RubySegment[] {
  const segments: RubySegment[] = []
  let pending = ""
  let i = 0

  const flush = (): void => {
    if (pending.length > 0) {
      segments.push({ kind: "text", value: pending })
      pending = ""
    }
  }

  while (i < input.length) {
    const char = input.charAt(i)

    if (char === ESCAPE && input.charAt(i + 1) === OPEN) {
      pending += OPEN
      i += 2
      continue
    }

    if (char !== OPEN) {
      pending += char
      i += 1
      continue
    }

    const end = findGroupEnd(input, i)
    if (end < 0) {
      // Unclosed brace: keep the damage local so later groups still parse.
      pending += OPEN
      i += 1
      continue
    }

    const ruby = toRubySegment(input.slice(i + 1, end))
    if (ruby === null) {
      // A rejected group still renders as text, so its escapes still apply.
      pending += unescapeBraces(input.slice(i, end + 1))
    } else {
      flush()
      segments.push(ruby)
    }
    i = end + 1
  }

  flush()
  return segments
}

/** Index of the `}` closing the group opened at `open`, or -1 when unclosed. */
function findGroupEnd(input: string, open: number): number {
  let depth = 0
  for (let i = open; i < input.length; i += 1) {
    const char = input.charAt(i)
    if (char === ESCAPE && input.charAt(i + 1) === OPEN) {
      i += 1
      continue
    }
    if (char === OPEN) {
      depth += 1
    } else if (char === CLOSE) {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

function toRubySegment(content: string): RubySegment | null {
  let separator = -1
  for (let i = 0; i < content.length; i += 1) {
    const char = content.charAt(i)
    if (char === ESCAPE && content.charAt(i + 1) === OPEN) {
      i += 1
      continue
    }
    // Nesting is ambiguous, so the whole group falls back to literal text.
    if (char === OPEN) return null
    if (char === SEPARATOR && separator < 0) separator = i
  }
  if (separator < 0) return null

  const base = unescapeBraces(content.slice(0, separator))
  const rt = unescapeBraces(content.slice(separator + 1))
  if (base.length === 0 || rt.length === 0) return null
  return { kind: "ruby", base, rt }
}

function unescapeBraces(value: string): string {
  return value.replaceAll(ESCAPE + OPEN, OPEN)
}
