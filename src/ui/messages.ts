/**
 * Typed wrappers around @plasmohq/messaging for the extension pages.
 * The panel and the options page never touch storage or the network directly
 * All persistence and LLM calls live in background.
 *
 * Background never rejects; it resolves with a BgResult envelope, which is unwrapped
 * here into a thrown Error so callers cannot mistake a failure for data.
 */
import { sendToBackground } from "@plasmohq/messaging"

import type {
  BgResult,
  LlmModelsResponse,
  MarkerDeleteResponse,
  NotionDatabaseConfigureRequest,
  NotionDatabaseSchemaRequest,
  NotionDatabaseSchemaResponse,
  NotionDatabasesRequest,
  NotionDatabasesResponse,
  MarkerUpsertResponse,
  SettingsGetResponse,
  SettingsSetRequest
} from "~/background/message-types"
import type {
  BwMarker,
  MarkerColor,
  MarkerQuery,
  SelectionCaptured
} from "~/core/marker/types"
import type { ConfigValues } from "~/core/provider/descriptor"
import type { AppSettings } from "~/core/settings/types"
import {
  BG_MESSAGE,
  type MarkerCreateRequest,
  type MarkerCreateResponse,
  type MarkerDeleteRequest,
  type MarkerGetRequest,
  type MarkerGetResponse,
  type MarkerListRequest,
  type MarkerListResponse,
  type MarkerUpsertRequest,
  type ProviderCatalogEntry,
  type ProviderCatalogResponse,
  type ProviderHostsRequest,
  type ProviderHostsResponse,
  type SelectionGetResponse,
  type SettingsSetResponse
} from "~/core/messaging/protocol"

function unwrap<T>(result: BgResult<T>): T {
  if (!result.ok) {
    throw new Error(result.error)
  }
  return result.data
}

export async function fetchSettings(): Promise<AppSettings> {
  const res = await sendToBackground<undefined, BgResult<SettingsGetResponse>>({
    name: BG_MESSAGE.settingsGet
  })
  return unwrap(res).settings
}

/**
 * Deep validation lives in background, where the provider registries are. Issues arrive
 * split by section so `{ field: "active" }` is attributable; a non-empty list means the
 * save was rejected and nothing was persisted.
 */
export async function saveSettings(
  settings: AppSettings
): Promise<SettingsSetResponse> {
  const res = await sendToBackground<SettingsSetRequest, BgResult<SettingsSetResponse>>({
    name: BG_MESSAGE.settingsSet,
    body: { settings }
  })
  return unwrap(res)
}

/** Descriptors carry functions, so the options page renders forms from this instead. */
export async function fetchProviderCatalog(): Promise<
  readonly ProviderCatalogEntry[]
> {
  const res = await sendToBackground<undefined, BgResult<ProviderCatalogResponse>>({
    name: BG_MESSAGE.providerCatalog
  })
  return unwrap(res).providers
}

/**
 * Which origins a provider will contact with these (possibly unsaved) values. Only the
 * provider knows whether a custom endpoint replaces its default, so the options page asks
 * instead of deriving it — see ProviderHostsRequest in protocol.ts.
 */
export async function fetchProviderHosts(
  body: ProviderHostsRequest
): Promise<readonly string[]> {
  const res = await sendToBackground<
    ProviderHostsRequest,
    BgResult<ProviderHostsResponse>
  >({
    name: BG_MESSAGE.providerHosts,
    body
  })
  return unwrap(res).origins
}

export interface LlmModelsBody {
  readonly providerId: string
  /** the values as typed, so a key that is not saved yet can still be tested */
  readonly values: ConfigValues
}

/** An empty array means the lookup failed; the provider contract never throws. */
export async function fetchLlmModels(
  providerId: string,
  values: ConfigValues
): Promise<readonly string[]> {
  const res = await sendToBackground<LlmModelsBody, BgResult<LlmModelsResponse>>({
    name: BG_MESSAGE.llmModels,
    body: { providerId, values }
  })
  return unwrap(res).models
}

export async function searchNotionDatabases(
  pat: string,
  query: string
): Promise<NotionDatabasesResponse> {
  const res = await sendToBackground<
    NotionDatabasesRequest,
    BgResult<NotionDatabasesResponse>
  >({
    name: BG_MESSAGE.notionDatabases,
    body: { pat, query }
  })
  return unwrap(res)
}

export async function inspectNotionDatabase(
  pat: string,
  databaseId: string
): Promise<NotionDatabaseSchemaResponse> {
  const res = await sendToBackground<
    NotionDatabaseSchemaRequest,
    BgResult<NotionDatabaseSchemaResponse>
  >({
    name: BG_MESSAGE.notionDatabaseSchema,
    body: { pat, databaseId }
  })
  return unwrap(res)
}

export async function configureNotionDatabase(
  pat: string,
  databaseId: string
): Promise<NotionDatabaseSchemaResponse> {
  const body: NotionDatabaseConfigureRequest = {
    pat,
    databaseId,
    confirmDataLoss: true
  }
  const res = await sendToBackground<
    NotionDatabaseConfigureRequest,
    BgResult<NotionDatabaseSchemaResponse>
  >({
    name: BG_MESSAGE.notionDatabaseConfigure,
    body
  })
  return unwrap(res)
}

export async function fetchMarkers(query: MarkerQuery): Promise<readonly BwMarker[]> {
  const res = await sendToBackground<MarkerListRequest, BgResult<MarkerListResponse>>({
    name: BG_MESSAGE.markerList,
    body: { query }
  })
  return unwrap(res).markers
}

export async function fetchMarker(id: string): Promise<BwMarker | null> {
  const res = await sendToBackground<MarkerGetRequest, BgResult<MarkerGetResponse>>({
    name: BG_MESSAGE.markerGet,
    body: { id }
  })
  return unwrap(res).marker
}

/** Background builds the marker from the selection; the viewer is never asked to. */
export async function createMarker(body: {
  readonly selection: SelectionCaptured
  readonly memo: string
  readonly color: MarkerColor
}): Promise<BwMarker> {
  const res = await sendToBackground<MarkerCreateRequest, BgResult<MarkerCreateResponse>>(
    {
      name: BG_MESSAGE.markerCreate,
      body
    }
  )
  return unwrap(res).marker
}

export async function upsertMarker(marker: BwMarker): Promise<BwMarker> {
  const res = await sendToBackground<MarkerUpsertRequest, BgResult<MarkerUpsertResponse>>(
    {
      name: BG_MESSAGE.markerUpsert,
      body: { marker }
    }
  )
  return unwrap(res).marker
}

export async function deleteMarker(id: string): Promise<void> {
  const res = await sendToBackground<MarkerDeleteRequest, BgResult<MarkerDeleteResponse>>(
    {
      name: BG_MESSAGE.markerDelete,
      body: { id }
    }
  )
  unwrap(res)
}

/** Returns the book context too, so a pending selection already knows its book title. */
export async function fetchPendingSelection(): Promise<SelectionGetResponse> {
  const res = await sendToBackground<undefined, BgResult<SelectionGetResponse>>({
    name: BG_MESSAGE.selectionGet
  })
  return unwrap(res)
}

/**
 * The panel owns the other half of the pending-selection lifecycle: background clears it
 * when a marker is created, this covers the user dismissing the draft instead.
 */
export async function clearPendingSelection(): Promise<void> {
  const res = await sendToBackground<undefined, BgResult<null>>({
    name: BG_MESSAGE.selectionClear
  })
  unwrap(res)
}

