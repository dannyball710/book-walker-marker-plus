import { readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { BG_MESSAGE } from "~/core/messaging/protocol"

/**
 * Plasmo routes a message by the handler's file name, and nothing type-checks that against
 * BG_MESSAGE — renaming one file leaves the send site compiling and silently unanswered.
 */
const handlerDir = fileURLToPath(
  new URL("../../src/background/messages", import.meta.url)
)

const handlerNames = readdirSync(handlerDir)
  .filter((file) => file.endsWith(".ts"))
  .map((file) => file.replace(/\.ts$/, ""))
  .sort()

const declaredNames: readonly string[] = Object.values(BG_MESSAGE).slice().sort()

describe("background message names", () => {
  it("has a handler file for every declared message name", () => {
    const missing = declaredNames.filter((name) => !handlerNames.includes(name))
    expect(missing).toEqual([])
  })

  it("has no handler file that is not declared in BG_MESSAGE", () => {
    const undeclared = handlerNames.filter((name) => !declaredNames.includes(name))
    expect(undeclared).toEqual([])
  })
})
