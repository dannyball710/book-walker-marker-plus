import { getMarker } from "~/background/marker-service"
import { handle, requireBody } from "~/background/result"
import type {
  MarkerGetRequest,
  MarkerGetResponse
} from "~/core/messaging/protocol"

const handler = handle<MarkerGetRequest, MarkerGetResponse>(
  async (request) => ({
    marker: await getMarker(requireBody(request.body).id)
  })
)

export default handler
