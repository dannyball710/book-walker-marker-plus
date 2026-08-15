import { handle } from "~/background/result"
import type {
  ProviderCatalogEntry,
  ProviderCatalogResponse
} from "~/core/messaging/protocol"
import type { ProviderDescriptor } from "~/core/provider/descriptor"
import { llmRegistry } from "~/llm"
import { markerStoreRegistry } from "~/storage"

function baseEntry(
  kind: ProviderCatalogEntry["kind"],
  descriptor: ProviderDescriptor
): ProviderCatalogEntry {
  return {
    kind,
    id: descriptor.id,
    label: descriptor.label,
    fields: descriptor.fields,
    // the default configuration's origins; a user-typed endpoint adds to these in the UI
    hosts: descriptor.hostsFor({}),
    ...(descriptor.docsUrl === undefined ? {} : { docsUrl: descriptor.docsUrl }),
    ...(descriptor.optionsTool === undefined
      ? {}
      : { optionsTool: descriptor.optionsTool })
  }
}

const handler = handle<undefined, ProviderCatalogResponse>(async () => ({
  providers: [
    ...markerStoreRegistry.list().map((d) => baseEntry("storage", d)),
    ...llmRegistry
      .list()
      .map((d) => ({ ...baseEntry("llm", d), modelField: d.modelField }))
  ]
}))

export default handler
