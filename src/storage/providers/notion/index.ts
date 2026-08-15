import type { MarkerStoreDescriptor } from "~/storage/provider"
import {
  notionConfigCodec,
  notionFields,
  NOTION_LABEL
} from "~/storage/providers/notion/config"
import { NotionMarkerStore } from "~/storage/providers/notion/marker-store"

const ID = "notion"

export const notionMarkerStoreDescriptor: MarkerStoreDescriptor = {
  id: ID,
  label: NOTION_LABEL,
  fields: notionFields,
  docsUrl: "https://developers.notion.com/docs/create-a-notion-integration",
  optionsTool: "notion-database",
  validate: (values) => notionConfigCodec.validate(values),
  // fixed endpoint: the database id is a path segment, not a host
  hostsFor: () => ["https://api.notion.com/*"],
  create: (values) => new NotionMarkerStore(ID, notionConfigCodec.parse(values))
}
