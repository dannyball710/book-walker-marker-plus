/**
 * Separate from `schema.ts` so importing the error type cannot drag a validator —
 * and whatever it depends on — into a bundle that only wanted to catch it. A class is
 * a value, so `verbatimModuleSyntax` cannot erase the import the way it does a type.
 */
export class BwApiError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = "BwApiError"
  }
}
