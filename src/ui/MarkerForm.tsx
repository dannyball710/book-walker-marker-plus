import { useEffect, useRef, useState } from "react"

import { t } from "~/core/i18n"
import type { MarkerColor } from "~/core/marker/types"
import { Icon } from "~/ui/Icon"
import type { MarkerSaveStatus } from "~/ui/hooks/useMarkerSession"
import { appendMemo } from "~/ui/logic/memo-draft"
import {
  buttonDanger,
  buttonDangerSolid,
  buttonPrimary,
  buttonQuiet,
  cx,
  spinner
} from "~/ui/styles"
import { ColorPicker } from "./ColorPicker"
import { RubyEditor } from "./RubyEditor"

export interface MemoAddition {
  readonly id: number
  readonly text: string
}

export interface MarkerFormProps {
  readonly initialMemo: string
  readonly initialColor: MarkerColor
  readonly saveLabel: string
  readonly savingLabel: string
  readonly disabled: boolean
  readonly saveStatus: MarkerSaveStatus
  readonly memoAddition: MemoAddition | null
  readonly onMemoAdditionApplied: (id: number) => void
  readonly onSave: (draft: { memo: string; color: MarkerColor }) => void
  /** editing only: deletion sits behind a confirm step */
  readonly onDelete: (() => void) | null
  /** pending only: throws the selection away */
  readonly onDismiss: (() => void) | null
}

/** Draft state resets by remounting when the parent changes marker or selection. */
export function MarkerForm(props: MarkerFormProps) {
  const [memo, setMemo] = useState(props.initialMemo)
  const [color, setColor] = useState<MarkerColor>(props.initialColor)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const appliedAdditionId = useRef<number | null>(null)

  const saveFeedback = (() => {
    switch (props.saveStatus) {
      case "saving":
        return { label: props.savingLabel, success: false }
      case "created":
        return { label: t("markerCreated"), success: true }
      case "saved":
        return { label: t("markerSaved"), success: true }
      default:
        return { label: props.saveLabel, success: false }
    }
  })()

  useEffect(() => {
    const addition = props.memoAddition
    if (addition === null || addition.id === appliedAdditionId.current) {
      return
    }
    appliedAdditionId.current = addition.id
    setMemo((current) => appendMemo(current, addition.text))
    props.onMemoAdditionApplied(addition.id)
  }, [props.memoAddition, props.onMemoAdditionApplied])

  return (
    <div className="grid gap-2.5">
      <label className="text-[11px] font-semibold text-ink-soft">{t("markerMemoLabel")}</label>
      <RubyEditor
        value={memo}
        onChange={setMemo}
        placeholder={t("markerMemoPlaceholder")}
        ariaLabel={t("markerMemoLabel")}
        disabled={props.disabled}
      />

      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold text-muted">{t("markerColorGroupLabel")}</span>
        <ColorPicker value={color} onChange={setColor} disabled={props.disabled} />
      </div>

      {props.onDelete !== null && confirmingDelete && (
        <div className="grid gap-2.5 rounded-ui-sm border border-danger/25 bg-danger-soft px-3 py-2.5 text-[11px] text-danger" role="alert">
          <span>{t("markerDeletePrompt")}</span>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={buttonQuiet}
              onClick={() => setConfirmingDelete(false)}>
              {t("commonCancel")}
            </button>
            <button
              type="button"
              className={buttonDangerSolid}
              disabled={props.disabled}
              onClick={() => {
                setConfirmingDelete(false)
                props.onDelete?.()
              }}>
              <Icon name="trash" size={17} />
              {t("markerDeleteConfirm")}
            </button>
          </div>
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 flex min-h-[52px] items-center justify-between gap-2 border-t border-line-strong bg-surface-elevated/95 px-2.5 py-2 shadow-[0_-8px_24px_rgb(0_0_0/0.12)] backdrop-blur-xl">
        <div className="flex min-w-0 gap-1">
          {props.onDismiss !== null && (
            <button
              type="button"
              className={buttonQuiet}
              disabled={props.disabled}
              onClick={props.onDismiss}>
              {t("markerDiscard")}
            </button>
          )}
          {props.onDelete !== null && !confirmingDelete && (
            <button
              type="button"
              className={buttonDanger}
              disabled={props.disabled}
              onClick={() => setConfirmingDelete(true)}>
              <Icon name="trash" size={17} />
              {t("commonDelete")}
            </button>
          )}
        </div>

        <button
          type="button"
          className={cx(
            `${buttonPrimary} !min-h-8 !px-2.5 !py-1 !text-xs`,
            saveFeedback.success && "!border-success !bg-success"
          )}
          disabled={props.disabled}
          aria-live="polite"
          onClick={() => props.onSave({ memo, color })}>
          {props.saveStatus === "saving" && <span className={spinner} />}
          {props.saveStatus !== "saving" && <Icon name="check" size={15} />}
          {saveFeedback.label}
        </button>
      </div>
    </div>
  )
}
