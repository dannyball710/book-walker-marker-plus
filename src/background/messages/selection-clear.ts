import { clearPendingSelection } from "~/background/marker-service"
import { handle } from "~/background/result"

// The panel's half of the pending-selection lifecycle: sent when the user
// dismisses the draft instead of creating a marker from it.
const handler = handle<undefined, null>(async () => {
  await clearPendingSelection()
  return null
})

export default handler
