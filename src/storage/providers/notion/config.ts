import * as z from "zod"

import { joinList, t } from "~/core/i18n"
import { createConfigCodec } from "~/core/provider/config"
import type { ConfigField } from "~/core/provider/descriptor"
import { PROP } from "~/storage/providers/notion/property-names"

export interface NotionConfig {
  readonly pat: string
  readonly databaseId: string
}

export const NOTION_LABEL = "Notion"

/** Every column the mapper reads; a missing one fails validation on the first query. */
const REQUIRED_COLUMNS = joinList([
  `${PROP.text} (title)`,
  `${PROP.memo} (rich_text)`,
  `${PROP.bookTitle} (rich_text)`,
  `${PROP.bookId} (rich_text)`,
  `${PROP.markerId} (rich_text)`,
  `${PROP.epubcfi} (rich_text)`,
  `${PROP.capturedProfile} (select)`,
  `${PROP.file} (rich_text)`,
  `${PROP.eFile} (rich_text)`,
  `${PROP.sidx} (number)`,
  `${PROP.eidx} (number)`,
  `${PROP.position} (rich_text)`,
  `${PROP.byProfile} (rich_text)`,
  `${PROP.color} (select)`,
  `${PROP.progress} (number)`,
  `${PROP.createdAt} (date)`,
  `${PROP.updatedAt} (date)`
])

export const notionFields: readonly ConfigField[] = [
  {
    key: "pat",
    label: t("notionPatLabel"),
    kind: "secret",
    required: true,
    placeholder: "ntn_…",
    help: t("notionPatHelp")
  },
  {
    key: "databaseId",
    label: t("notionDatabaseFieldLabel"),
    kind: "text",
    required: true,
    placeholder: t("notionDatabaseIdPlaceholder"),
    help: t("notionDatabaseIdHelp", { columns: REQUIRED_COLUMNS })
  }
]

export const notionConfigCodec = createConfigCodec<NotionConfig>({
  label: NOTION_LABEL,
  fields: notionFields,
  schema: z.object({
    pat: z.string().trim().min(1, t("validationNotionPat")),
    databaseId: z.string().trim().min(1, t("validationNotionDatabaseId"))
  })
})
