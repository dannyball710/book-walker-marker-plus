export function cx(...classes: readonly (string | false | null | undefined)[]): string {
  return classes.filter((value): value is string => typeof value === "string").join(" ")
}

export const buttonBase =
  "inline-flex min-h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-ui-sm border px-3 py-1.5 text-sm font-semibold leading-tight transition duration-150 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-45 enabled:active:translate-y-px"

export const buttonPrimary =
  `${buttonBase} border-accent bg-accent text-white shadow-[0_6px_16px_color-mix(in_srgb,rgb(var(--color-accent))_24%,transparent)] enabled:hover:border-accent-hover enabled:hover:bg-accent-hover dark:text-[#241b09]`

export const buttonSecondary =
  `${buttonBase} border-accent/35 bg-accent-soft text-accent-ink enabled:hover:border-accent enabled:hover:bg-surface-soft`

export const buttonQuiet =
  `${buttonBase} border-transparent bg-transparent text-muted enabled:hover:bg-surface-soft enabled:hover:text-ink`

export const buttonDanger =
  `${buttonBase} border-transparent bg-transparent text-danger enabled:hover:border-danger/20 enabled:hover:bg-danger-soft enabled:hover:text-danger-hover`

export const buttonDangerSolid =
  `${buttonBase} border-danger bg-danger text-white enabled:hover:border-danger-hover enabled:hover:bg-danger-hover`

export const buttonIcon =
  `${buttonBase} size-9 min-h-9 p-0`

export const buttonIconDanger =
  `${buttonIcon} border-transparent bg-transparent text-danger enabled:hover:border-danger/20 enabled:hover:bg-danger-soft enabled:hover:text-danger-hover`

export const buttonIconText =
  `${buttonBase} min-h-10 bg-surface-soft`

export const fieldControl =
  "min-h-10 w-full min-w-0 rounded-ui-sm border border-line-strong bg-surface px-3 py-2 text-ink transition placeholder:text-subtle hover:border-accent/50 focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/15 aria-invalid:border-danger"

export const eyebrow =
  "m-0 text-[11px] font-bold uppercase leading-tight tracking-[0.12em] text-accent"

export const errorBox =
  "my-2.5 rounded-ui-sm border border-danger/30 bg-danger-soft px-3 py-2.5 text-xs text-danger"

export const spinner =
  "size-4 shrink-0 animate-spin rounded-full border-2 border-current/25 border-t-current"
