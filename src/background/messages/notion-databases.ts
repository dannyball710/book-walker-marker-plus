import type {
  NotionDatabasesRequest,
  NotionDatabasesResponse
} from "~/background/message-types"
import { handle, requireBody } from "~/background/result"
import { t } from "~/core/i18n"
import { NotionClient } from "~/storage/providers/notion/client"

const handler = handle<NotionDatabasesRequest, NotionDatabasesResponse>(
  async (request) => {
    const { pat, query } = requireBody(request.body)
    const token = pat.trim()
    if (token === "") {
      throw new Error(t("validationNotionPat"))
    }
    return new NotionClient({ pat: token }).searchDatabases(query)
  }
)

export default handler
