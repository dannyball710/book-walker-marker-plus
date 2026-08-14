import * as z from "zod"

const MODELS_TIMEOUT_MS = 10_000

/** OpenAI-compatible `GET /models`; OpenRouter serves the same shape. */
const openAiStyleSchema = z.object({
  data: z.array(z.object({ id: z.string() }))
})

const geminiSchema = z.object({
  models: z.array(
    z.object({
      name: z.string(),
      supportedGenerationMethods: z.array(z.string()).optional()
    })
  )
})

function warnInvalidPayload(providerId: string): void {
  console.warn(`[bwm] ${providerId}: unexpected /models payload, model list unavailable`)
}

export function parseOpenAiStyleModels(
  providerId: string,
  json: unknown
): readonly string[] {
  const parsed = openAiStyleSchema.safeParse(json)
  if (!parsed.success) {
    warnInvalidPayload(providerId)
    return []
  }
  return parsed.data.data.map((model) => model.id)
}

export function parseGeminiModels(json: unknown): readonly string[] {
  const parsed = geminiSchema.safeParse(json)
  if (!parsed.success) {
    warnInvalidPayload("gemini")
    return []
  }
  return parsed.data.models
    .filter((model) => model.supportedGenerationMethods?.includes("generateContent") ?? true)
    .map((model) => model.name.replace(/^models\//, ""))
}

/** A blank or slash-suffixed custom endpoint would otherwise produce a broken URL. */
export function resolveBaseUrl(custom: string | undefined, fallback: string): string {
  const trimmed = custom?.trim().replace(/\/+$/, "")
  return trimmed ? trimmed : fallback
}

/** Never throws: the LlmProvider contract says a failed listing degrades to an empty list. */
export async function fetchModelIds(input: {
  readonly providerId: string
  readonly url: string
  readonly headers: Readonly<Record<string, string>>
  readonly parse: (json: unknown) => readonly string[]
}): Promise<readonly string[]> {
  try {
    const response = await fetch(input.url, {
      headers: { ...input.headers },
      // an unreachable custom baseUrl would otherwise hang the options dropdown forever
      signal: AbortSignal.timeout(MODELS_TIMEOUT_MS)
    })
    if (!response.ok) {
      console.warn(`[bwm] ${input.providerId}: models request failed with HTTP ${response.status}`)
      return []
    }
    return input.parse(await response.json())
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error"
    console.warn(`[bwm] ${input.providerId}: models request failed (${reason})`)
    return []
  }
}
