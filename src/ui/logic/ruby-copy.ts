const BLOCK_TAGS: ReadonlySet<string> = new Set([
  "BLOCKQUOTE",
  "DIV",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "LI",
  "P",
  "PRE",
  "TR"
])

function rubyAncestor(node: Node, boundary: HTMLElement): Element | null {
  let element = node.nodeType === 1 ? (node as Element) : node.parentElement
  while (element !== null && element !== boundary) {
    if (element.tagName === "RUBY") {
      return element
    }
    element = element.parentElement
  }
  return null
}

function rubyNotation(element: Element): string {
  const preserved = element.getAttribute("data-bwm-ruby")
  if (preserved !== null) {
    return preserved
  }

  const base = Array.from(element.childNodes)
    .filter(
      (child) =>
        child.nodeType !== 1 ||
        !["RP", "RT"].includes((child as Element).tagName)
    )
    .map((child) => child.textContent ?? "")
    .join("")
  const reading = element.querySelector("rt")?.textContent ?? ""
  return reading === "" ? base : `{${base}|${reading}}`
}

function serializeNode(node: Node): string {
  if (node.nodeType === 3) {
    return node.textContent ?? ""
  }
  if (node.nodeType !== 1 && node.nodeType !== 11) {
    return ""
  }

  if (node.nodeType === 1) {
    const element = node as Element
    if (element.tagName === "RUBY") {
      return rubyNotation(element)
    }
    if (element.tagName === "BR") {
      return "\n"
    }
  }

  const content = Array.from(node.childNodes).map(serializeNode).join("")
  if (node.nodeType === 1 && BLOCK_TAGS.has((node as Element).tagName)) {
    return `${content}\n`
  }
  return content
}

/**
 * Returns replacement clipboard text only when the selection contains rendered ruby.
 * Ordinary copies keep the browser's native rich/plain clipboard payloads untouched.
 */
export function selectedTextWithRuby(
  container: HTMLElement,
  selection: Selection | null
): string | null {
  if (selection === null || selection.rangeCount === 0 || selection.isCollapsed) {
    return null
  }

  const range = selection.getRangeAt(0)
  if (!container.contains(range.commonAncestorContainer)) {
    return null
  }

  const startRuby = rubyAncestor(range.startContainer, container)
  const endRuby = rubyAncestor(range.endContainer, container)
  if (startRuby !== null && startRuby === endRuby) {
    return rubyNotation(startRuby)
  }

  const fragment = range.cloneContents()
  if (fragment.querySelector("ruby") === null) {
    return null
  }

  return serializeNode(fragment)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}
