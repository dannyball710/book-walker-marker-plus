import type { SettingsSetRequest } from "~/background/message-types"
import { handle, requireBody } from "~/background/result"
import { t } from "~/core/i18n"
import type { SettingsSetResponse } from "~/core/messaging/protocol"
import type {
  ConfigIssue,
  ProviderDescriptor
} from "~/core/provider/descriptor"
import type { Registry } from "~/core/provider/registry"
import { parseSettings } from "~/core/settings/defaults"
import type { ProviderSelection } from "~/core/settings/types"
import { findProviderConfig } from "~/core/settings/types"
import { llmRegistry } from "~/llm"
import { markerStoreRegistry } from "~/storage"
import { setSettings } from "~/storage/settings"

function issuesOf(
  registry: Registry<ProviderDescriptor>,
  selection: ProviderSelection
): readonly ConfigIssue[] {
  const descriptor = registry.find(selection.active)
  if (descriptor === null) {
    return [
      { field: "active", message: t("errorUnknownProvider", { id: selection.active }) }
    ]
  }
  return descriptor.validate(findProviderConfig(selection, descriptor.id))
}

const handler = handle<SettingsSetRequest, SettingsSetResponse>(
  async (request) => {
    const settings = parseSettings(requireBody(request.body).settings)
    const storage = issuesOf(markerStoreRegistry, settings.storage)
    const llm = issuesOf(llmRegistry, settings.llm)

    // Storage blocks: every marker read needs a buildable store, so persisting an
    // unusable one turns one failed save into every later read failing. The LLM is
    // only needed at chat time and fails legibly there, so its issues are advisory —
    // otherwise a first-run prompt edit would be held hostage to an API key.
    if (storage.length > 0) {
      return { saved: false, storage, llm }
    }
    await setSettings(settings)
    return { saved: true, storage: [], llm }
  }
)

export default handler
