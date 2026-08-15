/** Placeholder expansion for the chatbot prompt presets. */

export interface PromptVars {
  readonly text: string
  readonly memo: string
  readonly bookTitle: string
  readonly responseLanguage: string
  readonly contextText?: string
}

const PLACEHOLDER = /\{\{\s*([A-Za-z]+)\s*\}\}/g

/** Substituted values are not rescanned, so a memo containing `{{text}}` stays literal. */
export function expandPrompt(template: string, vars: PromptVars): string {
  return template.replace(PLACEHOLDER, (match: string, name: string) => {
    switch (name) {
      case "text":
        return vars.text
      case "memo":
        return vars.memo
      case "bookTitle":
        return vars.bookTitle
      case "responseLanguage":
        return vars.responseLanguage
      default:
        return match
    }
  })
}
