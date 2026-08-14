import type {
  LlmModelsRequest,
  LlmModelsResponse
} from "~/background/message-types"
import { ensureHostPermission } from "~/background/permissions"
import { handle, requireBody } from "~/background/result"
import { llmRegistry } from "~/llm"

const handler = handle<LlmModelsRequest, LlmModelsResponse>(async (request) => {
  const { providerId, values } = requireBody(request.body)
  const descriptor = llmRegistry.get(providerId)

  // listModels degrades to [] on any failure, which would hide a missing host
  // permission behind an empty dropdown. Check it first so the reason is visible.
  await ensureHostPermission({
    label: descriptor.label,
    origins: descriptor.hostsFor(values)
  })

  return { models: await descriptor.listModels(values) }
})

export default handler
