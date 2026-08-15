/**
 * Finds the selected text inside a wider /cri response and returns one contiguous
 * context window of at most `windowLength` Unicode code points. The selection is
 * centred when possible; near a boundary, the other side fills the unused capacity.
 * `expectedOffset` disambiguates repeated text.
 */
export function extractSelectionContext(
  expandedText: string,
  selectedText: string,
  expectedOffset: number,
  windowLength = 50
): string {
  const limit = Math.max(0, Math.floor(windowLength))
  if (selectedText === "" || limit === 0) {
    return ""
  }

  const expanded = Array.from(expandedText)
  const selected = Array.from(selectedText)
  if (selected.length > expanded.length) {
    return selected.slice(0, limit).join("")
  }

  let bestStart = -1
  let bestDistance = Number.POSITIVE_INFINITY
  const lastStart = expanded.length - selected.length
  for (let start = 0; start <= lastStart; start += 1) {
    let matches = true
    for (let index = 0; index < selected.length; index += 1) {
      if (expanded[start + index] !== selected[index]) {
        matches = false
        break
      }
    }
    if (!matches) continue
    const distance = Math.abs(start - expectedOffset)
    if (distance < bestDistance) {
      bestStart = start
      bestDistance = distance
    }
  }

  if (bestStart < 0) {
    return selected.slice(0, limit).join("")
  }
  if (selected.length >= limit) {
    return selected.slice(0, limit).join("")
  }

  const selectedEnd = bestStart + selected.length
  const surrounding = limit - selected.length
  let windowStart = bestStart - Math.floor(surrounding / 2)
  let windowEnd = selectedEnd + Math.ceil(surrounding / 2)

  if (windowStart < 0) {
    windowEnd = Math.min(expanded.length, windowEnd - windowStart)
    windowStart = 0
  }
  if (windowEnd > expanded.length) {
    windowStart = Math.max(0, windowStart - (windowEnd - expanded.length))
    windowEnd = expanded.length
  }

  return expanded.slice(windowStart, windowEnd).join("")
}
