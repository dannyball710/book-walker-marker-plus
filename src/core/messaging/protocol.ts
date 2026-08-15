/**
 * Message contracts shared by the MAIN-world bridge, the ISOLATED-world UI,
 * the background service worker and the side panel.
 */
import type { ChatMessage, ChatSubject } from "~/core/chat/types"
import type {
  ConfigField,
  ConfigIssue,
  ConfigValues,
  ProviderOptionsTool
} from "~/core/provider/descriptor"
import type {
  BookContext,
  BwMarker,
  FontProfile,
  MarkerColor,
  MarkerQuery,
  RawMarkerItem,
  SelectionCaptured
} from "~/core/marker/types"

export const BRIDGE_SOURCE = "bwm" as const

/**
 * `kind` exists so the UI can decide what deserves the user's attention: losing a marker
 * they thought they saved must be visible, a degraded injection or a startup probe is a
 * console concern. Matching on the message text would be fragile.
 */
export type BridgeErrorKind =
  /** a selection produced no text, so the user's drag visibly did nothing — surface it */
  | "selection-failed"
  /**
   * The viewer did something we did not expect — a `/gm` injection that degraded, a
   * dialog that could not be closed, a request through a path we only guard defensively.
   * Markers may be missing from the page, but nothing the reader wrote is at risk, and
   * there is nothing they could do about it: console only.
   */
  | "injection-degraded"
  /** the bridge could not attach to the viewer — console only */
  | "startup"

export interface BridgeError {
  readonly kind: BridgeErrorKind
  readonly reason: string
}

export type BridgeToUiMessage =
  | { source: typeof BRIDGE_SOURCE; type: "book-context"; payload: BookContext }
  | { source: typeof BRIDGE_SOURCE; type: "selection"; payload: SelectionCaptured }
  | {
      source: typeof BRIDGE_SOURCE
      type: "gm-request"
      payload: { cid: string; reqId: string }
    }
  | {
      source: typeof BRIDGE_SOURCE
      type: "bridge-error"
      payload: BridgeError
    }

export interface UiToBridgeMessage {
  source: typeof BRIDGE_SOURCE
  type: "gm-response"
  payload: { reqId: string; markers: readonly RawMarkerItem[] }
}

/** @plasmohq/messaging request names (file names under src/background/messages). */
export const BG_MESSAGE = {
  markerList: "marker-list",
  markerGet: "marker-get",
  markerUpsert: "marker-upsert",
  markerCreate: "marker-create",
  markerDelete: "marker-delete",
  selectionCaptured: "selection-captured",
  selectionGet: "selection-get",
  selectionClear: "selection-clear",
  bookContext: "book-context",
  settingsGet: "settings-get",
  settingsSet: "settings-set",
  providerCatalog: "provider-catalog",
  providerHosts: "provider-hosts",
  llmModels: "llm-models",
  notionDatabases: "notion-databases",
  notionDatabaseSchema: "notion-database-schema",
  notionDatabaseConfigure: "notion-database-configure",
  panelFocus: "panel-focus"
} as const

export interface MarkerListRequest {
  readonly query: MarkerQuery
}
export interface MarkerListResponse {
  readonly markers: readonly BwMarker[]
}

export interface MarkerGetRequest {
  readonly id: string
}
export interface MarkerGetResponse {
  readonly marker: BwMarker | null
}

export interface MarkerUpsertRequest {
  readonly marker: BwMarker
}

/**
 * The extension builds the marker itself from the captured selection; the viewer's own
 * dialog and its /pm write are never involved. Background supplies the book title from
 * the stored BookContext.
 */
export interface MarkerCreateRequest {
  readonly selection: SelectionCaptured
  readonly memo: string
  readonly color: MarkerColor
}
export interface MarkerCreateResponse {
  readonly marker: BwMarker
}

export interface MarkerDeleteRequest {
  readonly id: string
}

export interface SelectionCapturedRequest {
  readonly selection: SelectionCaptured
}

export interface SelectionGetResponse {
  readonly selection: SelectionCaptured | null
  /** carries the book title, which SelectionCaptured itself does not hold */
  readonly context: BookContext | null
}

export interface BookContextRequest {
  readonly context: BookContext
}

/**
 * Serialisable view of a ProviderDescriptor. The descriptor itself carries functions and
 * lives next to its implementation (idb, the Notion client, the ai sdk), none of which may
 * be pulled into the options bundle — so the options page renders forms from this instead.
 */
export interface ProviderCatalogEntry {
  readonly kind: "storage" | "llm"
  readonly id: string
  readonly label: string
  readonly fields: readonly ConfigField[]
  readonly docsUrl?: string
  readonly optionsTool?: ProviderOptionsTool
  /** llm only: the field whose value is the model id */
  readonly modelField?: string
  /**
   * Origins the provider needs at its default configuration, i.e. `hostsFor({})`. The
   * options page cannot derive these — a default endpoint lives inside the provider module
   * — and they are not granted at install, so without them the first request fails on a
   * permission the user was never asked for. Hosts derived from a user-typed url field are
   * computed in the UI and unioned with these.
   */
  readonly hosts: readonly string[]
}

export interface ProviderCatalogResponse {
  readonly providers: readonly ProviderCatalogEntry[]
}

/**
 * Asks the provider itself which origins the given (possibly unsaved) values will contact.
 * The options page cannot compute this without duplicating the provider's endpoint logic,
 * and it cannot ask at click time either — an await spends the user activation that
 * `chrome.permissions.request` needs — so it refreshes this whenever the form changes and
 * uses the last answer synchronously in the save handler.
 */
export interface ProviderHostsRequest {
  readonly kind: "storage" | "llm"
  readonly providerId: string
  readonly values: ConfigValues
}

export interface ProviderHostsResponse {
  readonly origins: readonly string[]
}

/**
 * Deep validation runs in background, where the registries live. Issues are split by
 * section because field keys are only unique within one provider's own form.
 *
 * Storage issues block the save: every marker read depends on the store being buildable.
 * LLM issues are advisory — the model is only needed once the user chats, and an
 * unconfigured provider already fails legibly there — so requiring an API key before a
 * prompt edit can be saved would be a worse trade.
 */
export interface SettingsSetResponse {
  readonly saved: boolean
  readonly storage: readonly ConfigIssue[]
  readonly llm: readonly ConfigIssue[]
}

/** Sent from background to the side panel when a highlight is clicked. */
export interface PanelFocusMessage {
  readonly type: "panel/focus-marker"
  readonly marker: BwMarker
}

/** Pushed when /cri produced a new selection, so the panel does not have to poll. */
export interface PanelSelectionMessage {
  readonly type: "panel/pending-selection"
  readonly selection: SelectionCaptured
  readonly context: BookContext | null
}

/**
 * Sent from the side panel straight to the viewer tab (`chrome.tabs.sendMessage`), because
 * only the content script holds the page's marker cache and can reach the MAIN-world bridge.
 */
export type ContentCommand =
  | { readonly type: "content/refresh-markers" }
  | {
      readonly type: "content/upsert-highlight"
      readonly bookId: string
      readonly profile: FontProfile
      readonly marker: RawMarkerItem
    }
  | { readonly type: "content/remove-highlight"; readonly markerId: string }

/** Long-lived port used for chat streaming. */
export const CHAT_PORT_NAME = "chat" as const

export type ChatPortRequest =
  | {
      readonly type: "start"
      readonly subject: ChatSubject
      readonly prompt: string
    }
  | { readonly type: "abort" }
  | { readonly type: "clear" }

export type ChatPortResponse =
  | { readonly type: "delta"; readonly delta: string }
  | { readonly type: "done"; readonly message: ChatMessage }
  | { readonly type: "error"; readonly message: string }
