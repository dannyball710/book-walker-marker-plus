import type {
  NotionDatabaseSchemaRequest,
  NotionDatabaseSchemaResponse
} from "~/background/message-types"
import { handle, requireBody } from "~/background/result"
import { t } from "~/core/i18n"
import { NotionClient } from "~/storage/providers/notion/client"

const handler = handle<NotionDatabaseSchemaRequest, NotionDatabaseSchemaResponse>(
  async (request) => {
    const { pat, databaseId } = requireBody(request.body)
    const token = pat.trim()
    const id = databaseId.trim()
    if (token === "") {
      throw new Error(t("validationNotionPat"))
    }
    if (id === "") {
      throw new Error(t("validationNotionDatabaseId"))
    }
    return {
      status: await new NotionClient({ pat: token }).inspectDatabase(id)
    }
  }
)

export default handler
