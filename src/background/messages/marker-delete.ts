import type { MarkerDeleteResponse } from "~/background/message-types"
import { deleteMarker } from "~/background/marker-service"
import { handle, requireBody } from "~/background/result"
import type { MarkerDeleteRequest } from "~/core/messaging/protocol"

const handler = handle<MarkerDeleteRequest, MarkerDeleteResponse>(
  async (request) => {
    await deleteMarker(requireBody(request.body).id)
    return { ok: true }
  }
)

export default handler
