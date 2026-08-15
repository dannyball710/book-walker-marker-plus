import * as z from "zod"

import { t } from "~/core/i18n"
import type {
  NotionDatabaseSummary,
  NotionSchemaStatus
} from "~/core/notion/types"

import type { NotionFilter } from "~/storage/providers/notion/filter"
import { NotionStoreError } from "~/storage/providers/notion/errors"
import type { NotionProperties } from "~/storage/providers/notion/mapping"
import type { NotionConfig } from "~/storage/providers/notion/config"
import {
  planNotionSchema,
  type NotionDatabaseProperty
} from "~/storage/providers/notion/schema"
import {
  createRequestQueue,
  type AttemptOutcome,
  type RequestQueue
} from "~/storage/support/request-queue"

const NOTION_BASE = "https://api.notion.com/v1"
const NOTION_VERSION = "2022-06-28"
/** Notion allows roughly 3 requests/second per integration. */
const MIN_REQUEST_INTERVAL_MS = 350
export const MAX_PAGE_SIZE = 100

const queryResponseSchema = z.object({
  results: z.array(z.unknown()),
  has_more: z.boolean(),
  next_cursor: z.string().nullable()
})

const pageIdResponseSchema = z.object({
  results: z.array(z.object({ id: z.string() }))
})

const databaseTitleItemSchema = z.object({ plain_text: z.string() })
const databasePropertySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string()
})
const databaseSchema = z.object({
  id: z.string(),
  title: z.array(databaseTitleItemSchema),
  url: z.string().nullable().optional(),
  properties: z.record(z.string(), databasePropertySchema)
})
const databaseSearchSchema = z.object({
  results: z.array(databaseSchema.pick({ id: true, title: true, url: true })),
  has_more: z.boolean()
})

export interface NotionPage {
  readonly results: readonly unknown[]
  readonly hasMore: boolean
  readonly nextCursor: string | null
}

export interface NotionDatabaseSearchResult {
  readonly databases: readonly NotionDatabaseSummary[]
  readonly hasMore: boolean
}

interface NotionClientConfig {
  readonly pat: string
  readonly databaseId?: string
}

function retryAfterSecondsOf(response: Response): number | undefined {
  const header = Number(response.headers.get("Retry-After"))
  return Number.isFinite(header) && header > 0 ? header : undefined
}

/**
 * Owns HTTP, auth headers and response validation. Rate limiting and backoff come from
 * the shared request queue, so a future remote provider gets them without copying this.
 */
export class NotionClient {
  private readonly queue: RequestQueue = createRequestQueue({
    minIntervalMs: MIN_REQUEST_INTERVAL_MS,
    // Notion's 429 Retry-After is routinely 30s or more, so it gets its own ceiling
    retry: {
      maxRetries: 4,
      baseDelayMs: 500,
      maxDelayMs: 8000,
      maxRetryAfterMs: 60_000
    }
  })

  constructor(private readonly config: NotionClientConfig | NotionConfig) {}

  async searchDatabases(query: string): Promise<NotionDatabaseSearchResult> {
    const trimmed = query.trim()
    const raw = await this.request("POST", "/search", {
      filter: { property: "object", value: "database" },
      sort: { direction: "descending", timestamp: "last_edited_time" },
      page_size: 100,
      ...(trimmed === "" ? {} : { query: trimmed })
    })
    const parsed = databaseSearchSchema.parse(raw)
    return {
      databases: parsed.results.map((database) => ({
        id: database.id,
        title: database.title.map((item) => item.plain_text).join(""),
        url: database.url ?? null
      })),
      hasMore: parsed.has_more
    }
  }

  async inspectDatabase(databaseId: string): Promise<NotionSchemaStatus> {
    const database = await this.readDatabase(databaseId)
    return planNotionSchema(Object.values(database.properties)).status
  }

  async configureDatabase(databaseId: string): Promise<NotionSchemaStatus> {
    const database = await this.readDatabase(databaseId)
    const plan = planNotionSchema(Object.values(database.properties))
    if (plan.status.compatible) {
      return plan.status
    }
    const updated = databaseSchema.parse(
      await this.request("PATCH", `/databases/${encodeURIComponent(databaseId)}`, {
        properties: plan.properties
      })
    )
    return planNotionSchema(Object.values(updated.properties)).status
  }

  async query(
    filter: NotionFilter,
    pageSize: number,
    cursor: string | null
  ): Promise<NotionPage> {
    const raw = await this.request("POST", this.queryPath(), {
      filter,
      page_size: pageSize,
      ...(cursor === null ? {} : { start_cursor: cursor })
    })
    const parsed = queryResponseSchema.parse(raw)
    return {
      results: parsed.results,
      hasMore: parsed.has_more,
      nextCursor: parsed.next_cursor
    }
  }

  async findPageId(filter: NotionFilter): Promise<string | null> {
    const raw = await this.request("POST", this.queryPath(), {
      filter,
      page_size: 1
    })
    return pageIdResponseSchema.parse(raw).results[0]?.id ?? null
  }

  async createPage(properties: NotionProperties): Promise<void> {
    // Not idempotent: a 5xx may mean the page was created and the response lost,
    // so retrying it would leave two rows with the same markerId. A 429 is safe
    // because the request was rejected outright.
    await this.request(
      "POST",
      "/pages",
      {
        parent: { database_id: this.config.databaseId },
        properties
      },
      { retryServerErrors: false }
    )
  }

  async updatePage(
    pageId: string,
    properties: NotionProperties
  ): Promise<void> {
    await this.request("PATCH", `/pages/${pageId}`, { properties })
  }

  async archivePage(pageId: string): Promise<void> {
    await this.request("PATCH", `/pages/${pageId}`, { archived: true })
  }

  private async readDatabase(databaseId: string): Promise<{
    readonly properties: { readonly [name: string]: NotionDatabaseProperty }
  }> {
    return databaseSchema.parse(
      await this.request("GET", `/databases/${encodeURIComponent(databaseId)}`)
    )
  }

  private queryPath(): string {
    const databaseId = this.config.databaseId
    if (databaseId === undefined || databaseId === "") {
      throw new NotionStoreError(t("validationNotionDatabaseId"))
    }
    return `/databases/${encodeURIComponent(databaseId)}/query`
  }

  private request(
    method: "GET" | "POST" | "PATCH",
    path: string,
    body?: unknown,
    options: { readonly retryServerErrors: boolean } = {
      retryServerErrors: true
    }
  ): Promise<unknown> {
    return this.queue.run(async (): Promise<AttemptOutcome<unknown>> => {
      let response: Response
      try {
        response = await fetch(`${NOTION_BASE}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${this.config.pat}`,
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json"
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) })
        })
      } catch (cause) {
        // A dead network is not a rate limit; surface it instead of retrying. Which
        // call died is a diagnostic, so it goes to the log rather than to the reader.
        console.error("[bwm] notion request failed", method, path, cause)
        throw new NotionStoreError(t("errorNotionUnreachable"))
      }

      if (response.ok) {
        return { kind: "done", value: await response.json() }
      }

      const detail = await response.text().catch(() => "")
      const error = new NotionStoreError(
        t("errorNotionHttp", { status: String(response.status), detail }),
        response.status
      )
      const retryable =
        response.status === 429 ||
        (response.status >= 500 && options.retryServerErrors)
      if (!retryable) {
        throw error
      }
      const retryAfterSeconds = retryAfterSecondsOf(response)
      return {
        kind: "retry",
        error,
        ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds })
      }
    })
  }
}
