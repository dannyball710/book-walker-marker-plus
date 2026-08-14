import { Fragment } from "react"

import { parseRuby } from "./parse"

/** Shared by the hover tooltip, the side panel editor and the chatbot. */
export function RubyText(props: {
  readonly text: string
  readonly className?: string
}): JSX.Element {
  const segments = parseRuby(props.text)
  return (
    <span className={props.className}>
      {segments.map((segment, index) => (
        <Fragment key={index}>
          {segment.kind === "text" && segment.value}
          {segment.kind === "ruby" && (
            <ruby>
              {segment.base}
              <rt>{segment.rt}</rt>
            </ruby>
          )}
        </Fragment>
      ))}
    </span>
  )
}
