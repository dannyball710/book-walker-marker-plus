import { afterEach, describe, expect, it, vi } from "vitest"

import type { NotionDatabaseConfigureRequest } from "~/background/message-types"
import { t } from "~/core/i18n"
import { invoke } from "./harness"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("Notion setup messages", () => {
  it("refuses schema mutation without an explicit data-loss confirmation", async () => {
    const handler = (await import("~/background/messages/notion-database-configure"))
      .default
    const body = {
      pat: "ntn_test",
      databaseId: "database-1",
      confirmDataLoss: false
    } as unknown as NotionDatabaseConfigureRequest

    const response = await invoke(handler, {
      name: "notion-database-configure",
      body
    })

    expect(response).toEqual({
      ok: false,
      error: t("notionConfigureConfirmationRequired")
    })
  })
})
