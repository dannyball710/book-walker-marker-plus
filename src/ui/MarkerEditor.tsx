import { useCallback, useRef, useState, type ReactNode } from "react"

import { t } from "~/core/i18n"
import type { MarkerColor } from "~/core/marker/types"
import { RubyText } from "~/core/ruby/render"
import { Icon } from "~/ui/Icon"
import type { MarkerSession } from "~/ui/hooks/useMarkerSession"
import type { EditorState } from "~/ui/logic/editor-state"
import { MarkerForm, type MemoAddition } from "./MarkerForm"

const DEFAULT_COLOR: MarkerColor = "rgba(255,255,35,0.588235)"

export interface MarkerEditorProps {
  readonly session: MarkerSession
  readonly renderAssistant: (
    onUseReply: (reply: string) => void
  ) => ReactNode
}

interface Subject {
  /** remount key: a new subject must not inherit the previous draft */
  readonly key: string
  readonly text: string
  readonly memo: string
  readonly color: MarkerColor
  readonly saveLabel: string
  readonly savingLabel: string
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
      savingLabel: t("markerSaving"),
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
      savingLabel: t("markerCreating"),
      deletable: false
    }
  }
  return null
}

export function MarkerEditor(props: MarkerEditorProps) {
  const { session } = props
  const { state } = session
  const subject = toSubject(state)
  const formRef = useRef<HTMLElement | null>(null)
  const additionIdRef = useRef(0)
  const [memoAddition, setMemoAddition] = useState<MemoAddition | null>(null)

  const useReply = useCallback((reply: string) => {
    if (reply.trim() === "") {
      return
    }
    additionIdRef.current += 1
    setMemoAddition({ id: additionIdRef.current, text: reply })
    requestAnimationFrame(() => {
      const form = formRef.current
      const scroller = form?.closest("main")
      if (
        form === null ||
        form === undefined ||
        scroller === null ||
        scroller === undefined
      ) {
        return
      }
      const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches
      const top =
        form.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top +
        scroller.scrollTop -
        16
      scroller.scrollTo({
        top,
        behavior: reduceMotion ? "auto" : "smooth"
      })
    })
  }, [])

  return (
    <div className="flex h-full min-h-0 flex-col gap-3.5">
      {subject === null && (
        <div className="grid min-h-60 place-items-center content-center px-[22px] py-[30px] text-center text-muted">
          <div className="mb-3.5 grid size-[54px] -rotate-2 place-items-center rounded-[17px_17px_17px_5px] border border-accent/25 bg-accent-soft text-accent">
            <Icon name="bookmark" size={24} />
          </div>
          <strong className="text-[15px] text-ink">{t("markerEmptyTitle")}</strong>
          <p className="mt-1.5 mb-0 max-w-[280px] text-xs leading-7">{t("markerEmptyHint")}</p>
        </div>
      )}

      {subject !== null && (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <article className="shrink-0 overflow-hidden rounded-ui-sm border border-line bg-surface shadow-card">
            <header className="flex min-h-[30px] items-center justify-between gap-3 border-b border-line px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-[0.08em] text-muted">
              <span>{t("markerExcerptLabel")}</span>
              <span
                className="h-2 w-[30px] rounded-full border border-ink/10"
                style={{ backgroundColor: subject.color }}
                aria-hidden="true"
              />
            </header>
            <blockquote className="m-0 max-h-[20vh] overflow-y-auto whitespace-pre-wrap px-3 py-2.5 font-reading text-sm leading-7 text-ink">
              <RubyText text={subject.text} />
            </blockquote>

            <section ref={formRef} className="scroll-mt-3 border-t border-line px-3 py-2.5">
              <MarkerForm
                key={subject.key}
                initialMemo={subject.memo}
                initialColor={subject.color}
                saveLabel={subject.saveLabel}
                savingLabel={subject.savingLabel}
                disabled={session.busy}
                saveStatus={session.saveStatus}
                memoAddition={memoAddition}
                onMemoAdditionApplied={(id) => {
                  setMemoAddition((current) =>
                    current?.id === id ? null : current
                  )
                }}
                onSave={(draft) => void session.save(draft)}
                onDelete={subject.deletable ? () => void session.remove() : null}
                onDismiss={subject.deletable ? null : () => void session.dismiss()}
              />
            </section>
          </article>

          {props.renderAssistant(useReply)}
        </div>
      )}

      {session.error !== null && (
        <p className="fixed right-2 bottom-16 left-2 z-40 m-0 rounded-ui-sm border border-danger/30 bg-danger-soft px-3 py-2 text-[11px] leading-5 text-danger shadow-float" role="alert">
          {session.error}
        </p>
      )}
    </div>
  )
}
