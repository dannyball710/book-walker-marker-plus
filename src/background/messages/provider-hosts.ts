import { handle, requireBody } from "~/background/result"
import type {
  ProviderHostsRequest,
  ProviderHostsResponse
} from "~/core/messaging/protocol"
import { llmRegistry } from "~/llm"
import { markerStoreRegistry } from "~/storage"

const handler = handle<ProviderHostsRequest, ProviderHostsResponse>(
  async (request) => {
    const { kind, providerId, values } = requireBody(request.body)
    const registry = kind === "storage" ? markerStoreRegistry : llmRegistry
    // Unknown id throws UnknownProviderError, which surfaces as ok:false rather than
    // an empty list the options page would mistake for "needs no permission".
    return { origins: registry.get(providerId).hostsFor(values) }
  }
)

export default handler
