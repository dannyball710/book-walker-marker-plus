import type {
  NotionDatabaseConfigureRequest,
  NotionDatabaseSchemaResponse
} from "~/background/message-types"
import { handle, requireBody } from "~/background/result"
import { t } from "~/core/i18n"
import { NotionClient } from "~/storage/providers/notion/client"

const handler = handle<
  NotionDatabaseConfigureRequest,
  NotionDatabaseSchemaResponse
>(async (request) => {
  const { pat, databaseId, confirmDataLoss } = requireBody(request.body)
  const token = pat.trim()
  const id = databaseId.trim()
  if (token === "") {
    throw new Error(t("validationNotionPat"))
  }
  if (id === "") {
    throw new Error(t("validationNotionDatabaseId"))
  }
  if (confirmDataLoss !== true) {
    throw new Error(t("notionConfigureConfirmationRequired"))
  }
  return {
    status: await new NotionClient({ pat: token }).configureDatabase(id)
  }
})

export default handler
