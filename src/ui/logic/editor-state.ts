import type { BwMarker, SelectionCaptured } from "~/core/marker/types"

export interface EditorInput {
  /** marker pushed by background (highlight click) or picked from the list */
  readonly focusedMarker: BwMarker | null
  /** selection counter at the moment the marker was focused; null when none is */
  readonly focusedAtVersion: number | null
  /** /cri result waiting for the user to turn it into a marker */
  readonly pendingSelection: SelectionCaptured | null
  /** bumped every time a selection arrives, so the two can be ordered */
  readonly selectionVersion: number
}

export type EditorState =
  | { readonly kind: "empty" }
  | { readonly kind: "pending"; readonly selection: SelectionCaptured }
  | { readonly kind: "editing"; readonly marker: BwMarker }

/**
 * Last writer wins. Focusing a marker and selecting text are both the reader saying
 * "this is what I mean now", so the older one must give way: a marker focused after
 * the current selection keeps the panel, and a selection that arrived after the marker
 * was focused takes it back.
 */
export function resolveEditorState(input: EditorInput): EditorState {
  const marker = input.focusedMarker
  const selection = input.pendingSelection
  const outranked =
    input.focusedAtVersion !== null && input.selectionVersion > input.focusedAtVersion

  if (selection !== null && (marker === null || outranked)) {
    return { kind: "pending", selection }
  }
  if (marker !== null) {
    return { kind: "editing", marker }
  }
  return { kind: "empty" }
}

/** bookId the marker list should be scoped to, or null when nothing is loaded. */
export function editorBookId(state: EditorState): string | null {
  if (state.kind === "editing") {
    return state.marker.bookId
  }
  if (state.kind === "pending") {
    return state.selection.cid
  }
  return null
}
