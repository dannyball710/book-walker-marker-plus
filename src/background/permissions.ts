import { ChatUserError } from "~/background/errors"
import { joinList, t } from "~/core/i18n"

/**
 * The LLM hosts are optional permissions, so a provider configured before the
 * options page asked for its host will fail with an opaque `TypeError: Failed to
 * fetch`. Checking first turns that into an instruction the user can act on.
 *
 * `chrome.permissions.request()` deliberately does not live here — it needs a user
 * gesture, so only the options page can ask.
 */
export async function ensureHostPermission(input: {
  readonly label: string
  readonly origins: readonly string[]
}): Promise<void> {
  if (input.origins.length === 0) {
    return
  }
  const granted = await chrome.permissions.contains({ origins: [...input.origins] })
  if (!granted) {
    throw new ChatUserError(
      t("errorHostPermissionMissing", {
        label: input.label,
        origins: joinList(input.origins)
      })
    )
  }
}
