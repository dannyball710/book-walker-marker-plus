/**
 * Wire format of the Book Walker browserWebApi plus the extension's own model.
 */

/** `${sfs}_${sff}`, e.g. 'normal_default' */
export type FontProfile =
  | "small_default"
  | "normal_default"
  | "large_default"
  | "x-large_default"

export const FONT_PROFILES: readonly FontProfile[] = [
  "small_default",
  "normal_default",
  "large_default",
  "x-large_default"
]

export type FontSize = "small" | "normal" | "large" | "x-large"
export type FontFace = "default"

export type MarkerColor =
  | "rgba(255,150,200,0.588235)"
  | "rgba(255,255,35,0.588235)"
  | "rgba(140,255,35,0.588235)"
  | "rgba(150,200,255,0.588235)"

export const MARKER_COLORS: readonly MarkerColor[] = [
  "rgba(255,150,200,0.588235)",
  "rgba(255,255,35,0.588235)",
  "rgba(140,255,35,0.588235)",
  "rgba(150,200,255,0.588235)"
]

export interface RawMarkerAppendixBrowser {
  readonly sidx: number
  readonly sFile: string
  readonly eidx: number
  readonly eFile: string
  /** e.g. { normal_default: 'item/xhtml/p-003.xhtml#-acs-position-20-0' } */
  readonly position: { readonly [P in FontProfile]?: string }
}

export interface RawMarkerItem {
  readonly id: string
  readonly epubcfi: string
  readonly text: string
  readonly memo: string
  readonly color: MarkerColor
  readonly shape: "rect"
  /** ISO8601 with '+0900' */
  readonly date: string
  /** reading progress percentage */
  readonly pr: number
  readonly appendix: { readonly browser: RawMarkerAppendixBrowser }
}

/**
 * Spec reference, not a runtime contract: `/cri` is read field by field
 * where it is consumed. Kept because the shape is three flat fields that cannot drift.
 */
export interface CriResponse {
  readonly status: string
  readonly cfi: string
  readonly text: string
}

export interface RicPage {
  readonly file: string
  readonly sidx: number
  readonly eidx: number
}

export interface RicResponse {
  readonly status: string
  readonly file: string
  readonly sidx: number
  readonly eidx: number
  readonly pages: readonly RicPage[]
}

export interface ProfileLocator {
  readonly sFile: string
  readonly sidx: number
  readonly eFile: string
  readonly eidx: number
  readonly position?: string
}

export interface MarkerLocator {
  /** canonical anchor, valid across profiles */
  readonly epubcfi: string
  /** profile in effect when the marker was created */
  readonly capturedProfile: FontProfile
  /** per-profile region index cache, refilled via /ric after a font change */
  readonly byProfile: { readonly [P in FontProfile]?: ProfileLocator }
}

export interface BwMarker {
  readonly id: string
  /** = viewer cid */
  readonly bookId: string
  readonly bookTitle: string
  /** original text from /cri, without ruby */
  readonly text: string
  /** one contiguous window of up to 50 characters containing the selected text */
  readonly contextText?: string
  /** user note, which may contain ruby annotations */
  readonly memo: string
  readonly color: MarkerColor
  readonly locator: MarkerLocator
  readonly progress: number
  /** epoch ms */
  readonly createdAt: number
  readonly updatedAt: number
}

export interface MarkerQuery {
  readonly bookId: string
  /**
   * Region indexes only mean something within one font profile, so `file` and the sidx
   * range are only honoured together with the profile they were measured in.
   */
  readonly profile?: FontProfile
  /** restrict to a single xhtml file (= chapter); requires `profile` */
  readonly file?: string
  readonly sidxFrom?: number
  readonly sidxTo?: number
  readonly limit?: number
}

/** Viewer context captured from the page, needed to call the WebAPI. */
export interface BookContext {
  readonly cid: string
  readonly bookTitle: string
  readonly u1: string
  readonly bid: string
  readonly sfs: FontSize
  readonly sff: FontFace
}

/** A selection captured from /cri, pending marker creation. */
export interface SelectionCaptured {
  readonly cid: string
  readonly file: string
  readonly sidx: number
  readonly eidx: number
  readonly sfs: FontSize
  readonly sff: FontFace
  readonly cfi: string
  readonly text: string
  readonly contextText?: string
}
