import type { SettingsGetResponse } from "~/background/message-types"
import { handle } from "~/background/result"
import { getSettings } from "~/storage/settings"

const handler = handle<undefined, SettingsGetResponse>(async () => ({
  settings: await getSettings()
}))

export default handler
