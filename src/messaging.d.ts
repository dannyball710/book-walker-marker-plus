/**
 * Plasmo only emits the MessagesMetadata augmentation while `plasmo dev|build` runs, which
 * leaves `MessageName` as `never` during a plain `tsc --noEmit`. Declaring it here keeps the
 * message names type-checked without depending on generated output.
 */
import type {
  BookContextRequest,
  MarkerCreateRequest,
  MarkerDeleteRequest,
  MarkerGetRequest,
  MarkerListRequest,
  MarkerUpsertRequest,
  SelectionCapturedRequest
} from "~/core/messaging/protocol"
import type {
  LlmModelsRequest,
  PanelFocusRequest,
  SettingsSetRequest
} from "~/background/message-types"
import type { ProviderHostsRequest } from "~/core/messaging/protocol"

declare module "@plasmohq/messaging" {
  interface MessagesMetadata {
    "marker-list": MarkerListRequest
    "marker-get": MarkerGetRequest
    "marker-upsert": MarkerUpsertRequest
    "marker-create": MarkerCreateRequest
    "marker-delete": MarkerDeleteRequest
    "selection-captured": SelectionCapturedRequest
    "selection-get": undefined
    "selection-clear": undefined
    "book-context": BookContextRequest
    "settings-get": undefined
    "settings-set": SettingsSetRequest
    "llm-models": LlmModelsRequest
    "provider-catalog": undefined
    "provider-hosts": ProviderHostsRequest
    "panel-focus": PanelFocusRequest
  }
}
