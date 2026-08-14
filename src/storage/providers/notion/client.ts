import * as z from "zod"

import { t } from "~/core/i18n"

import type { NotionFilter } from "~/storage/providers/notion/filter"
import { NotionStoreError } from "~/storage/providers/notion/errors"
import type { NotionProperties } from "~/storage/providers/notion/mapping"
import type { NotionConfig } from "~/storage/providers/notion/config"
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

export interface NotionPage {
  readonly results: readonly unknown[]
  readonly hasMore: boolean
  readonly nextCursor: string | null
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

  constructor(private readonly config: NotionConfig) {}

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

  private queryPath(): string {
    return `/databases/${this.config.databaseId}/query`
  }

  private request(
    method: "POST" | "PATCH",
    path: string,
    body: unknown,
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
          body: JSON.stringify(body)
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
