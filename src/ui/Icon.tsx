export type IconName =
  | "arrow-down"
  | "arrow-up"
  | "bookmark"
  | "check"
  | "chevron-right"
  | "eye"
  | "eye-off"
  | "message"
  | "plus"
  | "search"
  | "send"
  | "settings"
  | "stop"
  | "trash"

export interface IconProps {
  readonly name: IconName
  readonly size?: number
}

/** Small, dependency-free line icons shared by extension pages. */
export function Icon(props: IconProps) {
  const size = props.size ?? 18

  return (
    <svg
      className="block shrink-0"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false">
      {props.name === "arrow-down" && (
        <>
          <path d="M12 5v14" />
          <path d="m6.5 13.5 5.5 5.5 5.5-5.5" />
        </>
      )}
      {props.name === "arrow-up" && (
        <>
          <path d="M12 19V5" />
          <path d="m6.5 10.5 5.5-5.5 5.5 5.5" />
        </>
      )}
      {props.name === "bookmark" && (
        <path d="M7 4.75A1.75 1.75 0 0 1 8.75 3h6.5A1.75 1.75 0 0 1 17 4.75V21l-5-3.25L7 21Z" />
      )}
      {props.name === "check" && <path d="m5 12.5 4.25 4.25L19 7" />}
      {props.name === "chevron-right" && <path d="m9 18 6-6-6-6" />}
      {props.name === "eye" && (
        <>
          <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
          <circle cx="12" cy="12" r="2.5" />
        </>
      )}
      {props.name === "eye-off" && (
        <>
          <path d="m3 3 18 18" />
          <path d="M10.6 6.15A10.9 10.9 0 0 1 12 6c6 0 9.5 6 9.5 6a15 15 0 0 1-2.05 2.7" />
          <path d="M6.2 6.2C3.8 7.85 2.5 12 2.5 12s3.5 6 9.5 6a9.8 9.8 0 0 0 3.1-.5" />
        </>
      )}
      {props.name === "message" && (
        <path d="M5.5 4h13A2.5 2.5 0 0 1 21 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-5.5 4v-4A2.5 2.5 0 0 1 2 14.5v-8A2.5 2.5 0 0 1 4.5 4Z" />
      )}
      {props.name === "plus" && (
        <>
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </>
      )}
      {props.name === "search" && (
        <>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4.5 4.5" />
        </>
      )}
      {props.name === "send" && (
        <>
          <path d="m21 3-7.5 18-3.2-7.3L3 10.5Z" />
          <path d="m10.3 13.7 4.2-4.2" />
        </>
      )}
      {props.name === "settings" && (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 8.95 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.52-1H3v-4h.08A1.7 1.7 0 0 0 4.6 8.95a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 8.95 4.6 1.7 1.7 0 0 0 10 3.08V3h4v.08a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06a1.7 1.7 0 0 0-.34 1.88A1.7 1.7 0 0 0 20.92 10H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z" />
        </>
      )}
      {props.name === "stop" && <rect x="6" y="6" width="12" height="12" rx="2" />}
      {props.name === "trash" && (
        <>
          <path d="M4 7h16" />
          <path d="M9 7V4h6v3" />
          <path d="m6 7 1 14h10l1-14" />
          <path d="M10 11v6M14 11v6" />
        </>
      )}
    </svg>
  )
}
