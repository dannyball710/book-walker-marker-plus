export interface SystemPromptInput {
  readonly bookTitle: string
  /** original Japanese passage captured from the viewer */
  readonly text: string
  /** user note, which may already contain ruby annotations */
  readonly memo: string
  readonly responseLanguage: string
  readonly contextText?: string
}

const NO_MEMO = "(the reader has not written a note yet)"

export function buildSystemPrompt(input: SystemPromptInput): string {
  const memo = input.memo.trim() ? input.memo : NO_MEMO
  const contextText = input.contextText ?? ""
  const surroundingContext =
    contextText === ""
      ? []
      : [
          "",
          "Context window containing the highlighted passage and its immediate surrounding text:",
          "<context>",
          contextText,
          "</context>"
        ]
  return [
    "You are a reading assistant for a Japanese ebook.",
    `The reader is going through "${input.bookTitle}", highlighted the passage below and asks questions about it.`,
    "",
    "Highlighted passage (Japanese, verbatim from the book):",
    "<passage>",
    input.text,
    "</passage>",
    ...surroundingContext,
    "",
    "The reader's own note on this passage:",
    "<note>",
    memo,
    "</note>",
    "",
    "Rules:",
    `- Answer in ${input.responseLanguage} unless the reader writes in another language.`,
    "- The <passage> is the exact highlight. Use <context> only to disambiguate it; text appearing only in <context> is not highlighted.",
    "- Say so plainly when the passage and its context are not enough.",
    "- Quote Japanese verbatim; do not translate it away when the reader asks about wording.",
    "- Furigana must use this extension's ruby syntax: {漢字|かんじ} — base and reading separated by '|', wrapped in braces. The extension renders it as <ruby>. Never write readings in parentheses or brackets.",
    "- Ruby syntax inside inline code or a fenced code block is shown literally and will not be converted. Write ruby annotations as ordinary text, without backticks.",
    "- Put only the kanji portion inside ruby and leave okurigana or other kana outside. For example, write {出会|であ}った, never {出会った|であった}.",
    "- Annotate a reading only where it helps; do not gloss every kanji."
  ].join("\n")
}
