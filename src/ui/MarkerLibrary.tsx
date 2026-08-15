import { useMemo, useState } from "react"

import { t } from "~/core/i18n"
import type { BwMarker } from "~/core/marker/types"
import { Icon } from "~/ui/Icon"
import { markerMatchesQuery } from "~/ui/logic/marker-search"
import { fieldControl } from "~/ui/styles"
import { MarkerList } from "./MarkerList"

export interface MarkerLibraryProps {
  readonly markers: readonly BwMarker[]
  readonly activeId: string | null
  readonly onSelect: (id: string) => void
}

export function MarkerLibrary(props: MarkerLibraryProps) {
  const [query, setQuery] = useState("")
  const matches = useMemo(
    () => props.markers.filter((marker) => markerMatchesQuery(marker, query)),
    [props.markers, query]
  )

  return (
    <div className="grid gap-2.5">
      <label className="relative block">
        <span className="sr-only">{t("markerSearchLabel")}</span>
        <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" aria-hidden="true">
          <Icon name="search" size={15} />
        </span>
        <input
          type="search"
          className={`${fieldControl} !min-h-9 !py-1.5 pr-2.5 pl-8 !text-xs`}
          value={query}
          placeholder={t("markerSearchPlaceholder")}
          aria-label={t("markerSearchLabel")}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      {matches.length > 0 && (
        <MarkerList
          markers={matches}
          activeId={props.activeId}
          onSelect={props.onSelect}
        />
      )}

      {matches.length === 0 && (
        <p className="m-0 py-10 text-center text-[11px] text-muted">
          {props.markers.length === 0
            ? t("markerLibraryEmpty")
            : t("markerSearchEmpty")}
        </p>
      )}
    </div>
  )
}
