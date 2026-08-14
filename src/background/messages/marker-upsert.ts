import type { MarkerUpsertResponse } from "~/background/message-types"
import { upsertMarker } from "~/background/marker-service"
import { handle, requireBody } from "~/background/result"
import type { MarkerUpsertRequest } from "~/core/messaging/protocol"

const handler = handle<MarkerUpsertRequest, MarkerUpsertResponse>(
  async (request) => {
    // The stored marker, not the request's: upsertMarker restamps updatedAt.
    return { marker: await upsertMarker(requireBody(request.body).marker) }
  }
)

export default handler
