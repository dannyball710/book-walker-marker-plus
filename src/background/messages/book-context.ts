import { setBookContext } from "~/background/marker-service"
import { backfillProfile } from "~/background/profile-sync"
import { handle, requireBody } from "~/background/result"
import { fontProfileOf } from "~/core/bwapi/urls"
import type { BookContext } from "~/core/marker/types"
import type { BookContextRequest } from "~/core/messaging/protocol"

/** Two tabs on the same book would otherwise each start the same /ric sweep. */
const running = new Set<string>()

const doneKey = (key: string): string => `bwm:backfilled:${key}`

/**
 * "We have seen this profile" is not the same as "the backfill finished". Only a run that
 * left nothing behind marks the profile done, so an interrupted or partly failed sweep is
 * picked up again on the next context report instead of being suppressed for the session.
 */
async function backfillOnce(context: BookContext): Promise<void> {
  const key = `${context.cid}:${fontProfileOf(context.sfs, context.sff)}`
  if (running.has(key)) {
    return
  }
  const stored = await chrome.storage.session.get(doneKey(key))
  if (stored[doneKey(key)] === true) {
    return
  }

  running.add(key)
  try {
    const result = await backfillProfile({ context })
    if (result.failed === 0) {
      await chrome.storage.session.set({ [doneKey(key)]: true })
    }
  } catch (error) {
    console.error("[bwm] profile backfill failed", error)
  } finally {
    running.delete(key)
  }
}

const handler = handle<BookContextRequest, null>(async (request) => {
  const { context } = requireBody(request.body)
  await setBookContext(context)
  // Fire-and-forget: the /ric sweep takes seconds and the viewer must not wait for it.
  void backfillOnce(context)
  return null
})

export default handler
