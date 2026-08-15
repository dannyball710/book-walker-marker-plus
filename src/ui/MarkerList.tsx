import type { BwMarker } from "~/core/marker/types"
import { Icon } from "~/ui/Icon"
import { cx } from "~/ui/styles"

export interface MarkerListProps {
  readonly markers: readonly BwMarker[]
  readonly activeId: string | null
  readonly onSelect: (id: string) => void
}

function preview(text: string, length: number): string {
  return text.replace(/\s+/g, " ").trim().slice(0, length)
}

function memoPreview(memo: string): string {
  return preview(memo.replace(/\{([^|{}]+)\|[^{}]+\}/g, "$1"), 54)
}

export function MarkerList(props: MarkerListProps) {
  return (
    <ul className="m-0 grid list-none gap-1.5 p-0">
      {props.markers.map((marker) => {
        const active = marker.id === props.activeId
        const note = memoPreview(marker.memo)
        return (
          <li key={marker.id}>
            <button
              type="button"
              className={cx(
                "grid w-full min-w-0 cursor-pointer grid-cols-[4px_minmax(0,1fr)_14px] items-center gap-2 overflow-hidden rounded-ui-sm border border-line bg-surface py-2 pr-2 text-left text-muted transition hover:translate-x-0.5 hover:border-accent/40 hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/40",
                active && "border-accent/45 bg-surface-tinted text-accent"
              )}
              title={preview(marker.text, 80)}
              aria-current={active ? "true" : undefined}
              onClick={() => props.onSelect(marker.id)}>
              <span
                className="h-full min-h-[30px] w-1 rounded-r"
                style={{ backgroundColor: marker.color }}
                aria-hidden="true"
              />
              <span className="grid min-w-0 gap-0.5">
                <span className="truncate font-reading text-[11px] text-ink-soft">{preview(marker.text, 60)}</span>
                {note !== "" && <span className="truncate text-[9px] text-muted">{note}</span>}
              </span>
              <Icon name="chevron-right" size={14} />
            </button>
          </li>
        )
      })}
    </ul>
  )
}
