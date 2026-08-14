import { t } from "~/core/i18n"
import { MARKER_COLORS, type MarkerColor } from "~/core/marker/types"

export interface ColorPickerProps {
  readonly value: MarkerColor
  readonly onChange: (color: MarkerColor) => void
  readonly disabled?: boolean
}

export function ColorPicker(props: ColorPickerProps) {
  return (
    <div className="row" role="radiogroup" aria-label={t("markerColorGroupLabel")}>
      {MARKER_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={color === props.value}
          aria-label={color}
          disabled={props.disabled}
          className={
            color === props.value ? "color-swatch color-swatch--active" : "color-swatch"
          }
          style={{ background: color }}
          onClick={() => props.onChange(color)}
        />
      ))}
    </div>
  )
}
