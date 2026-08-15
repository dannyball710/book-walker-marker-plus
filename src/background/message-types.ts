/**
 * Request/response shapes for background messages that `~/core/messaging/protocol.ts`
 * does not cover, plus the envelope every handler resolves with. Carries no logic,
 * so any context can import it without pulling in background code.
 */
import type { BwMarker } from "~/core/marker/types"
import type {
  NotionDatabaseSummary,
  NotionSchemaStatus
} from "~/core/notion/types"
import type { ConfigValues } from "~/core/provider/descriptor"
import type { AppSettings } from "~/core/settings/types"

/**
 * Handlers never reject and never resolve with a bare payload, so a caller can
 * always tell success from failure without guessing.
 */
export type BgResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: string }

/**
 * `chrome.storage.session` key holding the marker a highlight click asked the side
 * panel to focus. A panel that was closed at click time misses the relayed
 * PanelFocusMessage, so it reads this on mount instead — and clears it once focused.
 */
export const PENDING_FOCUS_KEY = "bwm:pending-focus"

export interface SettingsGetResponse {
  readonly settings: AppSettings
}

export interface SettingsSetRequest {
  readonly settings: AppSettings
}

export interface MarkerUpsertResponse {
  readonly marker: BwMarker
}

export interface MarkerDeleteResponse {
  readonly ok: boolean
}

export interface PanelFocusRequest {
  /** viewer-side snapshot used immediately while the storage backend is revalidated */
  readonly marker: BwMarker
}

export interface LlmModelsRequest {
  /** Raw form values, not a parsed config: the options page lists models for credentials that are typed but not yet saved. */
  readonly providerId: string
  readonly values: ConfigValues
}

export interface LlmModelsResponse {
  readonly models: readonly string[]
}

export interface NotionDatabasesRequest {
  readonly pat: string
  readonly query: string
}

export interface NotionDatabasesResponse {
  readonly databases: readonly NotionDatabaseSummary[]
  readonly hasMore: boolean
}

export interface NotionDatabaseSchemaRequest {
  readonly pat: string
  readonly databaseId: string
}

export interface NotionDatabaseSchemaResponse {
  readonly status: NotionSchemaStatus
}

export interface NotionDatabaseConfigureRequest
  extends NotionDatabaseSchemaRequest {
  /** Background refuses schema mutation unless the danger confirmation came from UI. */
  readonly confirmDataLoss: true
}
