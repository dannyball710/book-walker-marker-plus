import { z } from "zod"

import {
  configFingerprint,
  createConfigCodec
} from "~/core/provider/config"
import type { ConfigField } from "~/core/provider/descriptor"
import { ProviderConfigError, maskSecrets } from "~/core/provider/descriptor"

const fields: readonly ConfigField[] = [
  { key: "apiKey", label: "API key", kind: "secret", required: true },
  { key: "baseUrl", label: "Base URL", kind: "url", required: false }
]

const codec = createConfigCodec({
  label: "Test",
  fields,
  schema: z
    .object({
      apiKey: z.string().min(1),
      baseUrl: z.string().refine((value) => value === "" || value.startsWith("https://"), {
        message: "must be an absolute https URL"
      })
    })
    .transform((values) => ({ key: values.apiKey, base: values.baseUrl }))
})

describe("createConfigCodec", () => {
  it("reports every problem at once so the user does not fix them one round trip at a time", () => {
    const issues = codec.validate({ apiKey: "", baseUrl: "ftp://x" })
    expect(issues.map((issue) => issue.field).sort()).toEqual(["apiKey", "baseUrl"])
  })

  it("reports a whitespace-only required field as missing rather than as a schema violation", () => {
    const issues = codec.validate({ apiKey: "   ", baseUrl: "" })
    // Asserts the field, not the wording: the message is user-facing copy and may change.
    expect(issues.map((issue) => issue.field)).toEqual(["apiKey"])
    expect(issues[0]?.message).not.toContain("characters")
  })

  it("returns the transformed config, not the raw values", () => {
    expect(codec.parse({ apiKey: "sk-live", baseUrl: "" })).toEqual({
      key: "sk-live",
      base: ""
    })
  })

  it("throws ProviderConfigError carrying the offending fields", () => {
    expect(() => codec.parse({ apiKey: "", baseUrl: "" })).toThrow(ProviderConfigError)
  })
})

describe("maskSecrets", () => {
  it("keeps a provider-authored message from leaking the key it complains about", () => {
    const error = new ProviderConfigError("Test", [
      { field: "apiKey", message: "rejected sk-proj-ABCDEFGH1234567890" }
    ])
    expect(error.message).not.toContain("ABCDEFGH1234567890")
    expect(maskSecrets("token AIzaSyABCDEFGH12345")).toBe("token ***")
  })
})

describe("configFingerprint", () => {
  it("distinguishes configs that differ only by where the separators fall", () => {
    const left = configFingerprint("p", { a: "1&b=2", b: "3" })
    const right = configFingerprint("p", { a: "1", b: "2&b=3" })
    expect(left).not.toBe(right)
  })

  it("is stable regardless of key order, so an edit that changes nothing reuses the instance", () => {
    expect(configFingerprint("p", { a: "1", b: "2" })).toBe(
      configFingerprint("p", { b: "2", a: "1" })
    )
  })
})
