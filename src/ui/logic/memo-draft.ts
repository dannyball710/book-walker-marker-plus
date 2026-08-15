/** Append an assistant answer without erasing a note the reader has already written. */
export function appendMemo(current: string, addition: string): string {
  const next = addition.trim()
  if (next === "") {
    return current
  }

  const existing = current.trimEnd()
  return existing === "" ? next : `${existing}\n\n${next}`
}
