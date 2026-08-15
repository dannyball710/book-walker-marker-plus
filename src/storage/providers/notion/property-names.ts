import { t } from "~/core/i18n"

export const PROP = {
  text: t("notionPropertyTextName"),
  memo: t("notionPropertyMemoName"),
  bookTitle: t("notionPropertyBookName"),
  bookId: "bookId",
  markerId: "markerId",
  epubcfi: "epubcfi",
  capturedProfile: "capturedProfile",
  file: "file",
  eFile: "eFile",
  sidx: "sidx",
  eidx: "eidx",
  position: "position",
  color: "color",
  progress: "progress",
  /** every profile's locator as JSON; the flat columns above hold only the captured one */
  byProfile: "byProfile",
  createdAt: "createdAt",
  updatedAt: "updatedAt"
} as const

/** Every shipped locale name remains readable after the browser language changes. */
export const PROP_ALIASES = {
  text: ["Text", "原文", "本文"],
  memo: ["Note", "備註", "メモ"],
  bookTitle: ["Book", "書籍"]
} as const
