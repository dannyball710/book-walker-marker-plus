import {
  getBookContext,
  getPendingSelection
} from "~/background/marker-service"
import { handle } from "~/background/result"
import type { SelectionGetResponse } from "~/core/messaging/protocol"

const handler = handle<undefined, SelectionGetResponse>(async () => {
  const selection = await getPendingSelection()
  if (selection === null) {
    return { selection: null, context: null }
  }
  return { selection, context: await getBookContext(selection.cid) }
})

export default handler
