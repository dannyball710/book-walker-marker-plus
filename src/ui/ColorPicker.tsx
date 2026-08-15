import { t } from "~/core/i18n"
import { MARKER_COLORS, type MarkerColor } from "~/core/marker/types"
import { Icon } from "~/ui/Icon"
import { cx } from "~/ui/styles"

export interface ColorPickerProps {
  readonly value: MarkerColor
  readonly onChange: (color: MarkerColor) => void
  readonly disabled?: boolean
}

function colourLabel(color: MarkerColor): string {
  switch (color) {
    case "rgba(255,150,200,0.588235)":
      return t("markerColorPink")
    case "rgba(255,255,35,0.588235)":
      return t("markerColorYellow")
    case "rgba(140,255,35,0.588235)":
      return t("markerColorGreen")
    case "rgba(150,200,255,0.588235)":
      return t("markerColorBlue")
  }
}

export function ColorPicker(props: ColorPickerProps) {
  return (
    <div className="flex items-center gap-1.5" role="radiogroup" aria-label={t("markerColorGroupLabel")}>
      {MARKER_COLORS.map((color) => {
        const selected = color === props.value
        const label = colourLabel(color)
        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            title={label}
            disabled={props.disabled}
            className={cx(
              "grid size-[26px] cursor-pointer place-items-center rounded-full border border-line-strong p-0 text-[#20222b] transition enabled:hover:scale-110 focus-visible:scale-110 focus-visible:border-ink focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45",
              selected && "scale-110 border-ink"
            )}
            style={{ backgroundColor: color }}
            onClick={() => props.onChange(color)}>
            {selected && <Icon name="check" size={13} />}
          </button>
        )
      })}
    </div>
  )
}
