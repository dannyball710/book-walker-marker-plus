import * as z from "zod"

import { t } from "~/core/i18n"
import { createConfigCodec } from "~/core/provider/config"
import type { ConfigField } from "~/core/provider/descriptor"

export interface NotionConfig {
  readonly pat: string
  readonly databaseId: string
}

export const NOTION_LABEL = "Notion"

/** Every column the mapper reads; a missing one fails validation on the first query. */
const REQUIRED_COLUMNS =
  "原文 (title)、備註 (rich_text)、書籍 (rich_text)、bookId (rich_text)、markerId (rich_text)、epubcfi (rich_text)、capturedProfile (select)、file (rich_text)、eFile (rich_text)、sidx (number)、eidx (number)、position (rich_text)、byProfile (rich_text)、color (select)、progress (number)、createdAt (date)、updatedAt (date)"

export const notionFields: readonly ConfigField[] = [
  {
    key: "pat",
    label: "Integration Token (PAT)",
    kind: "secret",
    required: true,
    placeholder: "ntn_…",
    help: t("notionPatHelp")
  },
  {
    key: "databaseId",
    label: "Database ID",
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
