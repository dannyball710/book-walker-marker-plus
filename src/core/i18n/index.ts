/**
 * Typed access to `locales/<lang>/messages.json`.
 *
 * The catalogue is `chrome.i18n`, so one lookup works the same in background, in a
 * content script and in an extension page, and the browser picks the locale. en is
 * the default locale and therefore the type source: a key that is not in it does not
 * compile, and `tests/core/i18n/catalog.test.ts` keeps the other locales in step.
 */
import en from "../../../locales/en/messages.json"

type Catalog = typeof en

export type MessageKey = keyof Catalog & string

type PlaceholderName<K extends MessageKey> = Catalog[K] extends {
  readonly placeholders: infer P
}
  ? keyof P & string
  : never

/** One string per placeholder the message declares; keys are checked against the JSON. */
export type MessageArgs<K extends MessageKey> = {
  readonly [N in PlaceholderName<K>]: string
}

type ArgsFor<K extends MessageKey> = [PlaceholderName<K>] extends [never]
  ? []
  : [MessageArgs<K>]

interface Placeholder {
  readonly content: string
}

type PlaceholderMap = { readonly [name: string]: Placeholder }

/**
 * chrome.i18n takes substitutions positionally, so the `$1`-style `content` in the JSON is
 * what maps a named argument onto its slot. Reading it here keeps the order in the
 * catalogue rather than duplicated at every call site.
 */
function placeholdersOf(key: MessageKey): PlaceholderMap {
  const entry = en[key]
  return "placeholders" in entry ? entry.placeholders : {}
}

function slotOf(placeholder: Placeholder): number {
  return Number(placeholder.content.replace("$", ""))
}

function argOf(args: unknown, name: string): string {
  if (typeof args !== "object" || args === null) {
    return ""
  }
  const value: unknown = Reflect.get(args, name)
  return typeof value === "string" ? value : ""
}

function substitutionsOf(key: MessageKey, args: unknown): readonly string[] {
  const slots: string[] = []
  for (const [name, placeholder] of Object.entries(placeholdersOf(key))) {
    const slot = slotOf(placeholder)
    if (Number.isInteger(slot) && slot >= 1) {
      slots[slot - 1] = argOf(args, name)
    }
  }
  // A gap in the numbering would otherwise reach chrome.i18n as a hole.
  const filled: string[] = []
  for (let index = 0; index < slots.length; index += 1) {
    filled.push(slots[index] ?? "")
  }
  return filled
}

/** Used where chrome.i18n is absent — unit tests, and any world without extension APIs. */
function fallback(key: MessageKey, substitutions: readonly string[]): string {
  let text: string = en[key].message
  for (const [name, placeholder] of Object.entries(placeholdersOf(key))) {
    text = text.split(`$${name}$`).join(substitutions[slotOf(placeholder) - 1] ?? "")
  }
  return text
}

export function t<K extends MessageKey>(key: K, ...args: ArgsFor<K>): string {
  const substitutions = substitutionsOf(key, args[0])
  const message =
    typeof chrome === "undefined" || chrome.i18n === undefined
      ? ""
      : chrome.i18n.getMessage(key, [...substitutions])
  return message === "" ? fallback(key, substitutions) : message
}

/** Lists read differently per locale, so the separator is a message like any other. */
export function joinList(items: readonly string[]): string {
  return items.join(t("commonListSeparator"))
}
