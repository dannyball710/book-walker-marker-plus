import { t } from "~/core/i18n"
import type { MarkerColor } from "~/core/marker/types"
import { RubyText } from "~/core/ruby/render"
import type { EditorState } from "~/ui/logic/editor-state"
import type { MarkerSession } from "~/ui/hooks/useMarkerSession"
import { MarkerForm } from "./MarkerForm"
import { MarkerList } from "./MarkerList"

const DEFAULT_COLOR: MarkerColor = "rgba(255,255,35,0.588235)"

export interface MarkerEditorProps {
  readonly session: MarkerSession
}

interface Subject {
  /** remount key: a new subject must not inherit the previous draft */
  readonly key: string
  readonly text: string
  readonly memo: string
  readonly color: MarkerColor
  readonly saveLabel: string
  readonly deletable: boolean
}

function toSubject(state: EditorState): Subject | null {
  if (state.kind === "editing") {
    const { marker } = state
    return {
      key: `marker:${marker.id}`,
      text: marker.text,
      memo: marker.memo,
      color: marker.color,
      saveLabel: t("commonSave"),
      deletable: true
    }
  }
  if (state.kind === "pending") {
    return {
      key: `selection:${state.selection.cfi}`,
      text: state.selection.text,
      memo: "",
      color: DEFAULT_COLOR,
      saveLabel: t("markerCreate"),
      deletable: false
    }
  }
  return null
}

export function MarkerEditor(props: MarkerEditorProps) {
  const { session } = props
  const { state } = session
  const subject = toSubject(state)
  const activeId = state.kind === "editing" ? state.marker.id : null

  return (
    <div>
      <h2 className="section-title">{t("markerSectionTitle")}</h2>

      {subject === null && (
        <p className="hint">{t("markerEmptyHint")}</p>
      )}

      {subject !== null && (
        <>
          <div className="source-text">
            <RubyText text={subject.text} />
          </div>
          <MarkerForm
            key={subject.key}
            initialMemo={subject.memo}
            initialColor={subject.color}
            saveLabel={subject.saveLabel}
            disabled={session.busy}
            onSave={(draft) => void session.save(draft)}
            onDelete={subject.deletable ? () => void session.remove() : null}
            onDismiss={subject.deletable ? null : () => void session.dismiss()}
          />
        </>
      )}

      {session.error !== null && <p className="error">{session.error}</p>}

      {session.markers.length > 0 && (
        <>
          <h2 className="section-title" style={{ marginTop: 12 }}>
            {t("markerListHeading", { count: String(session.markers.length) })}
          </h2>
          <MarkerList
            markers={session.markers}
            activeId={activeId}
            onSelect={session.select}
          />
        </>
      )}
    </div>
  )
}
