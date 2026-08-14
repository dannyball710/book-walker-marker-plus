import { useState } from "react"

import { t } from "~/core/i18n"
import type { MarkerColor } from "~/core/marker/types"
import { ColorPicker } from "./ColorPicker"
import { RubyEditor } from "./RubyEditor"

export interface MarkerFormProps {
  readonly initialMemo: string
  readonly initialColor: MarkerColor
  readonly saveLabel: string
  readonly disabled: boolean
  readonly onSave: (draft: { memo: string; color: MarkerColor }) => void
  /** editing only: deletion sits behind a confirm step */
  readonly onDelete: (() => void) | null
  /** pending only: throws the selection away */
  readonly onDismiss: (() => void) | null
}

/**
 * Draft state lives here and is reset by remounting (the parent keys this component on the
 * marker/selection), so switching markers can never leak the previous note.
 */
export function MarkerForm(props: MarkerFormProps) {
  const [memo, setMemo] = useState(props.initialMemo)
  const [color, setColor] = useState<MarkerColor>(props.initialColor)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  return (
    <div>
      <p className="hint">{t("markerMemoHint")}</p>
      <RubyEditor
        value={memo}
        onChange={setMemo}
        placeholder={t("markerMemoPlaceholder")}
        disabled={props.disabled}
      />

      <div className="row" style={{ marginTop: 8 }}>
        <ColorPicker value={color} onChange={setColor} disabled={props.disabled} />
        <span style={{ flex: 1 }} />

        {props.onDismiss !== null && (
          <button type="button" disabled={props.disabled} onClick={props.onDismiss}>
            {t("markerDiscard")}
          </button>
        )}

        {props.onDelete !== null && !confirmingDelete && (
          <button
            type="button"
            className="danger"
            disabled={props.disabled}
            onClick={() => setConfirmingDelete(true)}>
            {t("commonDelete")}
          </button>
        )}
        {props.onDelete !== null && confirmingDelete && (
          <>
            <button type="button" onClick={() => setConfirmingDelete(false)}>
              {t("commonCancel")}
            </button>
            <button
              type="button"
              className="danger"
              disabled={props.disabled}
              onClick={() => {
                setConfirmingDelete(false)
                props.onDelete?.()
              }}>
              {t("markerDeleteConfirm")}
            </button>
          </>
        )}

        <button
          type="button"
          className="primary"
          disabled={props.disabled}
          onClick={() => props.onSave({ memo, color })}>
          {props.saveLabel}
        </button>
      </div>
    </div>
  )
}
