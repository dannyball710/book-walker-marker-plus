import { t } from "~/core/i18n"
import { cx } from "~/ui/styles"

export interface BrandProps {
  readonly compact?: boolean
}

/** Four marker colours form a small bookmark spine — the product's shared signature. */
export function Brand(props: BrandProps) {
  const compact = props.compact === true

  return (
    <div className={cx("flex min-w-0 items-center", compact ? "gap-1.5" : "gap-3")}>
      <span
        className={cx(
          "grid shrink-0 -rotate-2 grid-cols-4 overflow-hidden border border-ink/20 bg-surface shadow-card",
          compact
            ? "h-5 w-[15px] rounded-[3px_3px_5px_5px]"
            : "h-[31px] w-[23px] rounded-[4px_4px_8px_8px]"
        )}
        aria-hidden="true">
        <span className="bg-[#ff96c8]" />
        <span className="bg-[#f3e939]" />
        <span className="bg-[#8ee64c]" />
        <span className="bg-[#85b9f1]" />
      </span>
      <span
        className={cx(
          "min-w-0 font-bold tracking-[-0.015em] text-ink",
          compact ? "truncate text-[11px] tracking-[0.01em]" : "text-[15px]"
        )}>
        {t("extensionName")}
      </span>
    </div>
  )
}
