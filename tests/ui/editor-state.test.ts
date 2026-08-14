import { describe, expect, it } from "vitest"

import type { BwMarker, SelectionCaptured } from "~/core/marker/types"
import { editorBookId, resolveEditorState } from "~/ui/logic/editor-state"

const selection: SelectionCaptured = {
  cid: "book-1",
  file: "item/xhtml/p-003.xhtml",
  sidx: 20,
  eidx: 24,
  sfs: "normal",
  sff: "default",
  cfi: "epubcfi(/6/8!/4/2,/1:0,/1:8)",
  text: "the selected passage"
}

function marker(overrides: Partial<BwMarker> = {}): BwMarker {
  return {
    id: "m-1",
    bookId: "book-1",
    bookTitle: "a book",
    text: "the selected passage",
    memo: "",
    color: "rgba(255,255,35,0.588235)",
    locator: {
      epubcfi: selection.cfi,
      capturedProfile: "normal_default",
      byProfile: {
        normal_default: {
          sFile: selection.file,
          sidx: selection.sidx,
          eFile: selection.file,
          eidx: selection.eidx
        }
      }
    },
    progress: 12,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides
  }
}

describe("resolveEditorState", () => {
  it("reports empty when neither a marker nor a selection is available", () => {
    expect(
      resolveEditorState({
        focusedMarker: null,
        focusedAtVersion: null,
        pendingSelection: null,
        selectionVersion: 0
      })
    ).toEqual({ kind: "empty" })
  })

  it("offers to create a marker while a selection is pending", () => {
    const state = resolveEditorState({
      focusedMarker: null,
      focusedAtVersion: null,
      pendingSelection: selection,
      selectionVersion: 1
    })
    expect(state).toEqual({ kind: "pending", selection })
  })

  it("keeps a marker focused after the current selection, so the click that opened it wins", () => {
    const focused = marker()
    const state = resolveEditorState({
      focusedMarker: focused,
      focusedAtVersion: 1,
      pendingSelection: selection,
      selectionVersion: 1
    })
    expect(state).toEqual({ kind: "editing", marker: focused })
  })

  it("hands the panel to a selection that arrived after the marker was focused", () => {
    // The reported defect: without this the panel stays stuck on the focused marker and
    // the reader's new drag appears to do nothing.
    const state = resolveEditorState({
      focusedMarker: marker(),
      focusedAtVersion: 1,
      pendingSelection: selection,
      selectionVersion: 2
    })
    expect(state).toEqual({ kind: "pending", selection })
  })

  it("keeps a freshly created marker focused once its selection is consumed", () => {
    // Creation clears the pending selection without producing a new one, so the marker
    // it just produced must not be knocked out by its own disappearance.
    const created = marker({ id: "m-new" })
    const state = resolveEditorState({
      focusedMarker: created,
      focusedAtVersion: 2,
      pendingSelection: null,
      selectionVersion: 2
    })
    expect(state).toEqual({ kind: "editing", marker: created })
  })

  it("returns to the outranked marker when the newer selection is dismissed", () => {
    const focused = marker()
    const state = resolveEditorState({
      focusedMarker: focused,
      focusedAtVersion: 1,
      pendingSelection: null,
      selectionVersion: 5
    })
    expect(state).toEqual({ kind: "editing", marker: focused })
  })
})

describe("editorBookId", () => {
  it("scopes the marker list to the book of whatever is loaded", () => {
    expect(editorBookId({ kind: "editing", marker: marker({ bookId: "book-9" }) })).toBe(
      "book-9"
    )
    expect(editorBookId({ kind: "pending", selection })).toBe("book-1")
    expect(editorBookId({ kind: "empty" })).toBeNull()
  })
})
