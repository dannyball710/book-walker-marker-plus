import * as z from "zod"

import { t } from "~/core/i18n"

import {
  FONT_PROFILES,
  MARKER_COLORS,
  type BwMarker,
  type FontProfile,
  type MarkerColor,
  type ProfileLocator
} from "~/core/marker/types"
import { NotionStoreError } from "~/storage/providers/notion/errors"

/** Notion rejects a rich_text item longer than this. */
const RICH_TEXT_CHUNK = 2000

export const PROP = {
  text: "原文",
  memo: "備註",
  bookTitle: "書籍",
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

interface NotionRichTextValue {
  readonly text: { readonly content: string }
}

type NotionPropertyValue =
  | { readonly title: readonly NotionRichTextValue[] }
  | { readonly rich_text: readonly NotionRichTextValue[] }
  | { readonly number: number | null }
  | { readonly select: { readonly name: string } }
  | { readonly date: { readonly start: string } }

type NotionPropertyName = (typeof PROP)[keyof typeof PROP]

export type NotionProperties = {
  readonly [K in NotionPropertyName]: NotionPropertyValue
}

function toRichText(content: string): readonly NotionRichTextValue[] {
  const chunks: NotionRichTextValue[] = []
  for (let i = 0; i < content.length; i += RICH_TEXT_CHUNK) {
    chunks.push({ text: { content: content.slice(i, i + RICH_TEXT_CHUNK) } })
  }
  return chunks
}

export function markerToNotionProperties(marker: BwMarker): NotionProperties {
  const loc = marker.locator.byProfile[marker.locator.capturedProfile]
  return {
    [PROP.text]: { title: toRichText(marker.text) },
    [PROP.memo]: { rich_text: toRichText(marker.memo) },
    [PROP.bookTitle]: { rich_text: toRichText(marker.bookTitle) },
    [PROP.bookId]: { rich_text: toRichText(marker.bookId) },
    [PROP.markerId]: { rich_text: toRichText(marker.id) },
    [PROP.epubcfi]: { rich_text: toRichText(marker.locator.epubcfi) },
    [PROP.capturedProfile]: {
      select: { name: marker.locator.capturedProfile }
    },
    [PROP.file]: { rich_text: toRichText(loc?.sFile ?? "") },
    [PROP.eFile]: { rich_text: toRichText(loc?.eFile ?? "") },
    [PROP.sidx]: { number: loc?.sidx ?? null },
    [PROP.eidx]: { number: loc?.eidx ?? null },
    [PROP.position]: { rich_text: toRichText(loc?.position ?? "") },
    [PROP.color]: { select: { name: marker.color } },
    [PROP.progress]: { number: marker.progress },
    [PROP.byProfile]: {
      rich_text: toRichText(JSON.stringify(marker.locator.byProfile))
    },
    [PROP.createdAt]: {
      date: { start: new Date(marker.createdAt).toISOString() }
    },
    [PROP.updatedAt]: {
      date: { start: new Date(marker.updatedAt).toISOString() }
    }
  }
}

const richText = z.array(z.object({ plain_text: z.string() }))
const selectValue = z.object({ name: z.string() }).nullable()
const dateValue = z.object({ start: z.string() }).nullable()

const notionPageSchema = z.object({
  id: z.string(),
  properties: z.object({
    [PROP.text]: z.object({ title: richText }),
    [PROP.memo]: z.object({ rich_text: richText }),
    [PROP.bookTitle]: z.object({ rich_text: richText }),
    [PROP.bookId]: z.object({ rich_text: richText }),
    [PROP.markerId]: z.object({ rich_text: richText }),
    [PROP.epubcfi]: z.object({ rich_text: richText }),
    [PROP.capturedProfile]: z.object({ select: selectValue }),
    [PROP.file]: z.object({ rich_text: richText }),
    [PROP.eFile]: z.object({ rich_text: richText }),
    [PROP.sidx]: z.object({ number: z.number().nullable() }),
    [PROP.eidx]: z.object({ number: z.number().nullable() }),
    [PROP.position]: z.object({ rich_text: richText }),
    [PROP.color]: z.object({ select: selectValue }),
    [PROP.progress]: z.object({ number: z.number().nullable() }),
    [PROP.byProfile]: z.object({ rich_text: richText }),
    [PROP.createdAt]: z.object({ date: dateValue }),
    [PROP.updatedAt]: z.object({ date: dateValue })
  })
})

function isMarkerColor(value: string): value is MarkerColor {
  return MARKER_COLORS.some((color) => color === value)
}

function isFontProfile(value: string): value is FontProfile {
  return FONT_PROFILES.some((profile) => profile === value)
}

function plain(items: readonly { readonly plain_text: string }[]): string {
  return items.map((item) => item.plain_text).join("")
}

const profileLocatorSchema = z.object({
  sFile: z.string(),
  sidx: z.number(),
  eFile: z.string(),
  eidx: z.number(),
  position: z.string().optional()
})

/**
 * The whole `byProfile` map, so a font change does not lose the profiles the /ric
 * backfill computed. Returns null for a row written before this column existed, which
 * then falls back to rebuilding the captured profile from the flat columns.
 */
function parseByProfile(
  json: string
): { [P in FontProfile]?: ProfileLocator } | null {
  if (json === "") {
    return null
  }
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return null
  }
  const parsed = z.record(z.string(), profileLocatorSchema).safeParse(raw)
  if (!parsed.success) {
    return null
  }

  const byProfile: { [P in FontProfile]?: ProfileLocator } = {}
  for (const [key, value] of Object.entries(parsed.data)) {
    if (!isFontProfile(key)) {
      continue
    }
    byProfile[key] = {
      sFile: value.sFile,
      sidx: value.sidx,
      eFile: value.eFile,
      eidx: value.eidx,
      ...(value.position === undefined ? {} : { position: value.position })
    }
  }
  return byProfile
}

type NotionPageProps = z.infer<typeof notionPageSchema>["properties"]

/** Rows written before the `byProfile` column: only the captured profile survives. */
function legacyByProfile(
  props: NotionPageProps,
  profile: FontProfile
): { [P in FontProfile]?: ProfileLocator } {
  const byProfile: { [P in FontProfile]?: ProfileLocator } = {}
  const sFile = plain(props[PROP.file].rich_text)
  const sidx = props[PROP.sidx].number
  const eidx = props[PROP.eidx].number
  if (sFile === "" || sidx === null || eidx === null) {
    return byProfile
  }

  const eFile = plain(props[PROP.eFile].rich_text)
  const position = plain(props[PROP.position].rich_text)
  byProfile[profile] = {
    sFile,
    sidx,
    eFile: eFile === "" ? sFile : eFile,
    eidx,
    ...(position === "" ? {} : { position })
  }
  return byProfile
}

function toEpochMs(iso: string | undefined, fallback: number): number {
  if (iso === undefined) {
    return fallback
  }
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? fallback : ms
}

export interface MappedPages {
  readonly markers: readonly BwMarker[]
  /** rows that were not written by this extension, or were edited into an unusable state */
  readonly skipped: number
}

/**
 * The Notion database is an interface the user can edit by hand, so one unusable row
 * must not hide the rest of their library. Only a row-level data problem is skipped;
 * a schema mismatch means the database itself is wrong and still fails loud.
 */
export function notionPagesToMarkers(
  pages: readonly unknown[]
): MappedPages {
  const markers: BwMarker[] = []
  let skipped = 0
  for (const page of pages) {
    try {
      markers.push(notionPageToMarker(page))
    } catch (error) {
      if (!(error instanceof NotionStoreError)) {
        throw error
      }
      skipped += 1
    }
  }
  return { markers, skipped }
}

export function notionPageToMarker(page: unknown): BwMarker {
  const props = notionPageSchema.parse(page).properties

  const id = plain(props[PROP.markerId].rich_text)
  if (id === "") {
    throw new NotionStoreError(t("errorNotionRowNotOurs", { prop: PROP.markerId }))
  }

  const colorName = props[PROP.color].select?.name ?? ""
  if (!isMarkerColor(colorName)) {
    throw new NotionStoreError(
      t("errorNotionValueUnknown", { id, prop: PROP.color, value: colorName })
    )
  }

  const profileName = props[PROP.capturedProfile].select?.name ?? ""
  if (!isFontProfile(profileName)) {
    throw new NotionStoreError(
      t("errorNotionValueUnknown", {
        id,
        prop: PROP.capturedProfile,
        value: profileName
      })
    )
  }

  const byProfile: { [P in FontProfile]?: ProfileLocator } =
    parseByProfile(plain(props[PROP.byProfile].rich_text)) ??
    legacyByProfile(props, profileName)

  // Not Date.now(): a missing timestamp would otherwise read differently on every
  // fetch, so anything sorting or comparing by age would flap.
  const createdAt = toEpochMs(props[PROP.createdAt].date?.start, 0)
  return {
    id,
    bookId: plain(props[PROP.bookId].rich_text),
    bookTitle: plain(props[PROP.bookTitle].rich_text),
    text: plain(props[PROP.text].title),
    memo: plain(props[PROP.memo].rich_text),
    color: colorName,
    locator: {
      epubcfi: plain(props[PROP.epubcfi].rich_text),
      capturedProfile: profileName,
      byProfile
    },
    progress: props[PROP.progress].number ?? 0,
    createdAt,
    updatedAt: toEpochMs(props[PROP.updatedAt].date?.start, createdAt)
  }
}
