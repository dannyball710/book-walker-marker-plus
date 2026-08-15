import { useEffect, useState } from "react"

import type { ChatSubject } from "~/core/chat/types"
import { t } from "~/core/i18n"
import type { BookContext } from "~/core/marker/types"
import type { PromptVars } from "~/core/prompt/expand"
import { DEFAULT_SETTINGS } from "~/core/settings/defaults"
import { Brand } from "~/ui/Brand"
import { Chatbot } from "~/ui/Chatbot"
import { Icon } from "~/ui/Icon"
import { MarkerEditor } from "~/ui/MarkerEditor"
import { MarkerLibrary } from "~/ui/MarkerLibrary"
import { useMarkerSession } from "~/ui/hooks/useMarkerSession"
import { useSettings } from "~/ui/hooks/useSettings"
import type { EditorState } from "~/ui/logic/editor-state"
import { buttonIcon, cx, errorBox } from "~/ui/styles"
import "~/ui/ui.css"

function promptVars(
  state: EditorState,
  context: BookContext | null,
  responseLanguage: string
): PromptVars {
  if (state.kind === "editing") {
    const { marker } = state
    return {
      text: marker.text,
      memo: marker.memo,
      bookTitle: marker.bookTitle,
      responseLanguage,
      ...(marker.contextText === undefined
        ? {}
        : { contextText: marker.contextText })
    }
  }
  if (state.kind === "pending") {
    return {
      text: state.selection.text,
      memo: "",
      bookTitle: context?.bookTitle ?? "",
      responseLanguage,
      ...(state.selection.contextText === undefined
        ? {}
        : { contextText: state.selection.contextText })
    }
  }
  return { text: "", memo: "", bookTitle: "", responseLanguage }
}

/**
 * A selection can be asked about before it is saved, so it becomes a draft subject that
 * carries its own text. The cfi keys it, so moving to another selection starts a new chat.
 */
function chatSubject(state: EditorState, vars: PromptVars): ChatSubject | null {
  if (state.kind === "editing") {
    const { marker } = state
    return {
      kind: "marker",
      markerId: marker.id,
      ...(marker.locator.epubcfi === ""
        ? {}
        : { key: `${marker.bookId}:${marker.locator.epubcfi}` })
    }
  }
  if (state.kind === "pending") {
    return {
      kind: "draft",
      key: `${state.selection.cid}:${state.selection.cfi}`,
      text: vars.text,
      memo: vars.memo,
      bookTitle: vars.bookTitle,
      ...(vars.contextText === undefined
        ? {}
        : { contextText: vars.contextText })
    }
  }
  return null
}

type PanelView = "workspace" | "library"

function editorIdentity(state: EditorState): string {
  if (state.kind === "editing") {
    return `marker:${state.marker.id}`
  }
  if (state.kind === "pending") {
    return `selection:${state.selection.cfi}`
  }
  return "empty"
}

function SidePanel() {
  const session = useMarkerSession()
  const [view, setView] = useState<PanelView>("workspace")
  const { settings, error: settingsError } = useSettings()
  const { state } = session
  const vars = promptVars(
    state,
    session.bookContext,
    settings?.responseLanguage ?? DEFAULT_SETTINGS.responseLanguage
  )
  const subject = chatSubject(state, vars)
  const bookTitle =
    state.kind === "editing"
      ? state.marker.bookTitle
      : session.bookContext?.bookTitle ?? t("panelNoBook")
  const activeId = state.kind === "editing" ? state.marker.id : null
  const identity = editorIdentity(state)

  useEffect(() => {
    setView("workspace")
  }, [identity])

  return (
    <div className="flex h-screen min-w-0 flex-col overflow-hidden bg-canvas">
      <header className="flex min-h-[50px] shrink-0 items-center justify-between gap-2 border-b border-line bg-surface px-2.5 py-1.5">
        <div className="min-w-0">
          <Brand compact />
          <span className="ml-[21px] block max-w-[270px] truncate text-[9px] leading-tight text-muted max-[390px]:max-w-[220px]" title={bookTitle}>
            {bookTitle}
          </span>
        </div>
        <button
          type="button"
          className={`${buttonIcon} !size-8 !min-h-8 border-transparent bg-transparent text-muted hover:bg-surface-soft hover:text-ink`}
          title={t("commonSettings")}
          aria-label={t("commonSettings")}
          onClick={() => chrome.runtime.openOptionsPage()}>
          <Icon name="settings" />
        </button>
      </header>

      <nav className="grid min-h-9 shrink-0 grid-cols-2 border-b border-line bg-surface" role="tablist" aria-label={t("panelToolsLabel")}>
        <button
          id="workspace-tab"
          type="button"
          role="tab"
          aria-selected={view === "workspace"}
          aria-controls="workspace-panel"
          className={cx(
            "relative cursor-pointer border-0 bg-transparent px-2 py-1.5 text-[10px] font-semibold text-muted transition after:absolute after:right-6 after:bottom-0 after:left-6 after:h-0.5 after:bg-transparent hover:text-ink focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-accent/40",
            view === "workspace" && "text-accent after:bg-accent"
          )}
          onClick={() => setView("workspace")}>
          {t("panelWorkspaceTab")}
        </button>
        <button
          id="library-tab"
          type="button"
          role="tab"
          aria-selected={view === "library"}
          aria-controls="library-panel"
          className={cx(
            "relative flex cursor-pointer items-center justify-center gap-1.5 border-0 bg-transparent px-2 py-1.5 text-[10px] font-semibold text-muted transition after:absolute after:right-6 after:bottom-0 after:left-6 after:h-0.5 after:bg-transparent hover:text-ink focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-accent/40",
            view === "library" && "text-accent after:bg-accent"
          )}
          onClick={() => setView("library")}>
          {t("markerLibraryTab")}
          <span className="inline-grid min-w-[17px] place-items-center rounded-full bg-surface-soft px-1 text-[8px] tabular-nums text-muted">
            {session.markers.length}
          </span>
        </button>
      </nav>

      <main
        className={cx(
          "min-h-0 flex-1 overflow-x-hidden px-2.5 pt-2.5",
          view === "workspace"
            ? "overflow-hidden pb-[156px]"
            : "overflow-y-auto pb-4"
        )}>
        <section
          id="workspace-panel"
          role="tabpanel"
          aria-labelledby="workspace-tab"
          className="h-full min-h-0"
          hidden={view !== "workspace"}>
          <MarkerEditor
            session={session}
            renderAssistant={(onUseReply) => (
              <div className="flex min-h-0 flex-1 flex-col">
                {settingsError !== null && <p className={errorBox}>{settingsError}</p>}
                <Chatbot
                  subject={subject}
                  context={vars}
                  prompts={settings?.prompts ?? DEFAULT_SETTINGS.prompts}
                  onUseReply={onUseReply}
                />
              </div>
            )}
          />
        </section>
        <section
          id="library-panel"
          role="tabpanel"
          aria-labelledby="library-tab"
          hidden={view !== "library"}>
          <MarkerLibrary
            markers={session.markers}
            activeId={activeId}
            onSelect={(id) => {
              session.select(id)
              setView("workspace")
            }}
          />
        </section>
      </main>
    </div>
  )
}

export default SidePanel
