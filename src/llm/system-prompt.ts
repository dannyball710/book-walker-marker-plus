export interface SystemPromptInput {
  readonly bookTitle: string
  /** original Japanese passage captured from the viewer */
  readonly text: string
  /** user note, may already contain {漢字|かんじ} ruby annotations */
  readonly memo: string
}

const NO_MEMO = "(the reader has not written a note yet)"

export function buildSystemPrompt(input: SystemPromptInput): string {
  const memo = input.memo.trim() ? input.memo : NO_MEMO
  return [
    "You are a reading assistant for a Japanese ebook.",
    `The reader is going through "${input.bookTitle}", highlighted the passage below and asks questions about it.`,
    "",
    "Highlighted passage (Japanese, verbatim from the book):",
    "<passage>",
    input.text,
    "</passage>",
    "",
    "The reader's own note on this passage:",
    "<note>",
    memo,
    "</note>",
    "",
    "Rules:",
    "- Answer in Traditional Chinese (Taiwan) unless the reader writes in another language.",
    "- Ground every answer in the passage; say so plainly when the passage alone is not enough.",
    "- Quote Japanese verbatim; do not translate it away when the reader asks about wording.",
    "- Furigana must use this extension's ruby syntax: {漢字|かんじ} — base and reading separated by '|', wrapped in braces. The extension renders it as <ruby>. Never write readings in parentheses or brackets.",
    "- Annotate a reading only where it helps; do not gloss every kanji."
  ].join("\n")
}
