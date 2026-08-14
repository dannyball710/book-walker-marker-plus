import type { BwMarker } from "~/core/marker/types"

export interface MarkerListProps {
  readonly markers: readonly BwMarker[]
  readonly activeId: string | null
  readonly onSelect: (id: string) => void
}

function preview(marker: BwMarker): string {
  return marker.text.replace(/\s+/g, " ").slice(0, 60)
}

export function MarkerList(props: MarkerListProps) {
  return (
    <ul className="marker-list">
      {props.markers.map((marker) => (
        <li key={marker.id}>
          <button
            type="button"
            className={
              marker.id === props.activeId
                ? "marker-list__item marker-list__item--active"
                : "marker-list__item"
            }
            title={preview(marker)}
            onClick={() => props.onSelect(marker.id)}>
            <span className="marker-list__dot" style={{ background: marker.color }} />
            {preview(marker)}
          </button>
        </li>
      ))}
    </ul>
  )
}
