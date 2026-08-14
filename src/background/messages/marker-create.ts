import { createFromSelection } from "~/background/marker-service"
import { handle, requireBody } from "~/background/result"
import type {
  MarkerCreateRequest,
  MarkerCreateResponse
} from "~/core/messaging/protocol"

const handler = handle<MarkerCreateRequest, MarkerCreateResponse>(
  async (request) => {
    const { selection, memo, color } = requireBody(request.body)
    return { marker: await createFromSelection({ selection, memo, color }) }
  }
)

export default handler
