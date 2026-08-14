import { listMarkers } from "~/background/marker-service"
import { handle, requireBody } from "~/background/result"
import type {
  MarkerListRequest,
  MarkerListResponse
} from "~/core/messaging/protocol"

const handler = handle<MarkerListRequest, MarkerListResponse>(
  async (request) => ({
    markers: await listMarkers(requireBody(request.body).query)
  })
)

export default handler
