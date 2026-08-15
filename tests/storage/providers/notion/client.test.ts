import { afterEach, describe, expect, it, vi } from "vitest"

import { NotionClient } from "~/storage/providers/notion/client"

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  })
}

function database(properties: object): object {
  return {
    id: "database-1",
    title: [{ plain_text: "Reading notes" }],
    url: "https://www.notion.so/database-1",
    properties
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("NotionClient database setup", () => {
  it("searches database objects with the typed name", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      json({
        results: [database({})],
        has_more: false
      })
    )
    vi.stubGlobal("fetch", fetchMock)

    const result = await new NotionClient({ pat: "ntn_test" }).searchDatabases(
      "Reading"
    )

    expect(result).toEqual({
      databases: [
        {
          id: "database-1",
          title: "Reading notes",
          url: "https://www.notion.so/database-1"
        }
      ],
      hasMore: false
    })
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.notion.com/v1/search",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          filter: { property: "object", value: "database" },
          sort: { direction: "descending", timestamp: "last_edited_time" },
          page_size: 100,
          query: "Reading"
        })
      })
    )
  })

  it("retrieves the selected database schema without a GET body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      json(
        database({
          Name: { id: "title", name: "Name", type: "title", title: {} }
        })
      )
    )
    vi.stubGlobal("fetch", fetchMock)

    const status = await new NotionClient({ pat: "ntn_test" }).inspectDatabase(
      "database/with spaces"
    )

    expect(status.compatible).toBe(false)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.notion.com/v1/databases/database%2Fwith%20spaces",
      expect.not.objectContaining({ body: expect.anything() })
    )
  })

  it("sends the planned property patch after destructive confirmation", async () => {
    const incomplete = database({
      Name: { id: "title", name: "Name", type: "title", title: {} }
    })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(incomplete))
      .mockResolvedValueOnce(json(incomplete))
    vi.stubGlobal("fetch", fetchMock)

    await new NotionClient({ pat: "ntn_test" }).configureDatabase("database-1")

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.notion.com/v1/databases/database-1",
      expect.objectContaining({
        method: "PATCH",
        body: expect.stringContaining('"Note":{"rich_text":{}}')
      })
    )
  })
})
