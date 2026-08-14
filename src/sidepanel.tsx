import type { ChatSubject } from "~/core/chat/types"
import { t } from "~/core/i18n"
import type { PromptVars } from "~/core/prompt/expand"
import { DEFAULT_SETTINGS } from "~/core/settings/defaults"
import { Chatbot } from "~/ui/Chatbot"
import { MarkerEditor } from "~/ui/MarkerEditor"
import { useMarkerSession } from "~/ui/hooks/useMarkerSession"
import { useSettings } from "~/ui/hooks/useSettings"
import type { EditorState } from "~/ui/logic/editor-state"
import type { BookContext } from "~/core/marker/types"
import "~/ui/ui.css"

function promptVars(state: EditorState, context: BookContext | null): PromptVars {
  if (state.kind === "editing") {
    const { marker } = state
    return { text: marker.text, memo: marker.memo, bookTitle: marker.bookTitle }
  }
  if (state.kind === "pending") {
    return {
      text: state.selection.text,
      memo: "",
      bookTitle: context?.bookTitle ?? ""
    }
  }
  return { text: "", memo: "", bookTitle: "" }
}

/**
 * A selection can be asked about before it is saved, so it becomes a draft subject that
 * carries its own text. The cfi keys it, so moving to another selection starts a new
 * conversation instead of continuing the previous one.
 */
function chatSubject(state: EditorState, vars: PromptVars): ChatSubject | null {
  if (state.kind === "editing") {
    return { kind: "marker", markerId: state.marker.id }
  }
  if (state.kind === "pending") {
    return {
      kind: "draft",
      key: state.selection.cfi,
      text: vars.text,
      memo: vars.memo,
      bookTitle: vars.bookTitle
    }
  }
  return null
}

function SidePanel() {
  const session = useMarkerSession()
  const { settings, error: settingsError } = useSettings()
  const { state } = session
  const vars = promptVars(state, session.bookContext)

  return (
    <div className="panel">
      <div className="panel__header">
        <button
          type="button"
          className="panel__settings"
          onClick={() => chrome.runtime.openOptionsPage()}>
          {t("commonSettings")}
        </button>
      </div>
      <div className="panel__top">
        <MarkerEditor session={session} />
      </div>
      <div className="panel__bottom">
        {settingsError !== null && <p className="error">{settingsError}</p>}
        <Chatbot
          subject={chatSubject(state, vars)}
          context={vars}
          prompts={settings?.prompts ?? DEFAULT_SETTINGS.prompts}
        />
      </div>
    </div>
  )
}

export default SidePanel
