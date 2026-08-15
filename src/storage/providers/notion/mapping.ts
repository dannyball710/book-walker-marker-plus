import * as z from "zod"

import { t } from "~/core/i18n"

import {
  FONT_PROFILES,
  type BwMarker,
  type FontProfile,
  type MarkerColor,
  type ProfileLocator
} from "~/core/marker/types"
import { NotionStoreError } from "~/storage/providers/notion/errors"
import {
  PROP,
  PROP_ALIASES
} from "~/storage/providers/notion/property-names"

/** Notion rejects a rich_text item longer than this. */
const RICH_TEXT_CHUNK = 2000

interface NotionRichTextValue {
  readonly text: { readonly content: string }
}

type NotionPropertyValue =
  | { readonly title: readonly NotionRichTextValue[] }
  | { readonly rich_text: readonly NotionRichTextValue[] }
  | { readonly number: number | null }
  | { readonly select: { readonly name: string } }
  | { readonly date: { readonly start: string } }

export interface NotionProperties {
  readonly [name: string]: NotionPropertyValue
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
    [PROP.color]: { select: { name: notionColorName(marker.color) } },
    [PROP.progress]: { number: marker.progress },
    [PROP.byProfile]: {
      rich_text: toRichText(
        JSON.stringify({
          version: 2,
          byProfile: marker.locator.byProfile,
          ...(marker.contextText === undefined
            ? {}
            : { contextText: marker.contextText })
        })
      )
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

const notionPropertiesSchema = z.object({
  text: z.object({ title: richText }),
  memo: z.object({ rich_text: richText }),
  bookTitle: z.object({ rich_text: richText }),
  bookId: z.object({ rich_text: richText }),
  markerId: z.object({ rich_text: richText }),
  epubcfi: z.object({ rich_text: richText }),
  capturedProfile: z.object({ select: selectValue }),
  file: z.object({ rich_text: richText }),
  eFile: z.object({ rich_text: richText }),
  sidx: z.object({ number: z.number().nullable() }),
  eidx: z.object({ number: z.number().nullable() }),
  position: z.object({ rich_text: richText }),
  color: z.object({ select: selectValue }),
  progress: z.object({ number: z.number().nullable() }),
  byProfile: z.object({ rich_text: richText }),
  createdAt: z.object({ date: dateValue }),
  updatedAt: z.object({ date: dateValue })
})

const rawNotionPageSchema = z.object({
  id: z.string(),
  properties: z.record(z.string(), z.unknown())
})

type NotionPageProps = z.infer<typeof notionPropertiesSchema>

function propertyByAlias(
  properties: Readonly<Record<string, unknown>>,
  current: string,
  aliases: readonly string[]
): unknown {
  if (Object.hasOwn(properties, current)) {
    return properties[current]
  }
  for (const alias of aliases) {
    if (Object.hasOwn(properties, alias)) {
      return properties[alias]
    }
  }
  return undefined
}

function parseNotionPage(page: unknown): {
  readonly id: string
  readonly properties: NotionPageProps
} {
  const raw = rawNotionPageSchema.parse(page)
  return {
    id: raw.id,
    properties: notionPropertiesSchema.parse({
      ...raw.properties,
      text: propertyByAlias(raw.properties, PROP.text, PROP_ALIASES.text),
      memo: propertyByAlias(raw.properties, PROP.memo, PROP_ALIASES.memo),
      bookTitle: propertyByAlias(
        raw.properties,
        PROP.bookTitle,
        PROP_ALIASES.bookTitle
      )
    })
  }
}

type NotionColorName = "pink" | "yellow" | "green" | "blue"

/** Notion select option names reject commas, so raw rgba values cannot be stored there. */
function notionColorName(color: MarkerColor): NotionColorName {
  switch (color) {
    case "rgba(255,150,200,0.588235)":
      return "pink"
    case "rgba(255,255,35,0.588235)":
      return "yellow"
    case "rgba(140,255,35,0.588235)":
      return "green"
    case "rgba(150,200,255,0.588235)":
      return "blue"
  }
}

/** Raw rgba names remain readable for databases created before the safe encoding. */
function markerColorFor(value: string): MarkerColor | null {
  switch (value) {
    case "pink":
    case "rgba(255,150,200,0.588235)":
      return "rgba(255,150,200,0.588235)"
    case "yellow":
    case "rgba(255,255,35,0.588235)":
      return "rgba(255,255,35,0.588235)"
    case "green":
    case "rgba(140,255,35,0.588235)":
      return "rgba(140,255,35,0.588235)"
    case "blue":
    case "rgba(150,200,255,0.588235)":
      return "rgba(150,200,255,0.588235)"
    default:
      return null
  }
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

interface StoredMarkerPayload {
  readonly byProfile: { readonly [P in FontProfile]?: ProfileLocator }
  readonly contextText?: string
}

const storedMarkerPayloadSchema = z.object({
  version: z.literal(2),
  byProfile: z.record(z.string(), profileLocatorSchema),
  contextText: z.string().optional()
})

const splitContextPayloadSchema = z.object({
  version: z.literal(1),
  byProfile: z.record(z.string(), profileLocatorSchema),
  contextBefore: z.string().optional(),
  contextAfter: z.string().optional()
})

function knownProfiles(
  entries: Readonly<Record<string, z.infer<typeof profileLocatorSchema>>>
): { [P in FontProfile]?: ProfileLocator } {
  const byProfile: { [P in FontProfile]?: ProfileLocator } = {}
  for (const [key, value] of Object.entries(entries)) {
    if (!isFontProfile(key)) continue
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

/** New rows use an envelope; the raw profile map remains readable for existing rows. */
function parseStoredMarkerPayload(
  json: string,
  selectedText: string
): StoredMarkerPayload | null {
  if (json === "") return null
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return null
  }

  const envelope = storedMarkerPayloadSchema.safeParse(raw)
  if (envelope.success) {
    return {
      byProfile: knownProfiles(envelope.data.byProfile),
      ...(envelope.data.contextText === undefined
        ? {}
        : { contextText: envelope.data.contextText })
    }
  }

  const splitContext = splitContextPayloadSchema.safeParse(raw)
  if (splitContext.success) {
    const before = splitContext.data.contextBefore ?? ""
    const after = splitContext.data.contextAfter ?? ""
    return {
      byProfile: knownProfiles(splitContext.data.byProfile),
      ...(before === "" && after === ""
        ? {}
        : { contextText: `${before}${selectedText}${after}` })
    }
  }

  const legacy = z.record(z.string(), profileLocatorSchema).safeParse(raw)
  return legacy.success ? { byProfile: knownProfiles(legacy.data) } : null
}

/** Rows written before the `byProfile` column: only the captured profile survives. */
function legacyByProfile(
  props: NotionPageProps,
  profile: FontProfile
): { [P in FontProfile]?: ProfileLocator } {
  const byProfile: { [P in FontProfile]?: ProfileLocator } = {}
  const sFile = plain(props.file.rich_text)
  const sidx = props.sidx.number
  const eidx = props.eidx.number
  if (sFile === "" || sidx === null || eidx === null) {
    return byProfile
  }

  const eFile = plain(props.eFile.rich_text)
  const position = plain(props.position.rich_text)
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
  const props = parseNotionPage(page).properties

  const id = plain(props.markerId.rich_text)
  if (id === "") {
    throw new NotionStoreError(t("errorNotionRowNotOurs", { prop: PROP.markerId }))
  }

  const colorName = props.color.select?.name ?? ""
  const color = markerColorFor(colorName)
  if (color === null) {
    throw new NotionStoreError(
      t("errorNotionValueUnknown", { id, prop: PROP.color, value: colorName })
    )
  }

  const profileName = props.capturedProfile.select?.name ?? ""
  if (!isFontProfile(profileName)) {
    throw new NotionStoreError(
      t("errorNotionValueUnknown", {
        id,
        prop: PROP.capturedProfile,
        value: profileName
      })
    )
  }

  const selectedText = plain(props.text.title)
  const storedPayload = parseStoredMarkerPayload(
    plain(props.byProfile.rich_text),
    selectedText
  )
  const byProfile: { [P in FontProfile]?: ProfileLocator } =
    storedPayload?.byProfile ?? legacyByProfile(props, profileName)

  // Not Date.now(): a missing timestamp would otherwise read differently on every
  // fetch, so anything sorting or comparing by age would flap.
  const createdAt = toEpochMs(props.createdAt.date?.start, 0)
  return {
    id,
    bookId: plain(props.bookId.rich_text),
    bookTitle: plain(props.bookTitle.rich_text),
    text: selectedText,
    ...(storedPayload?.contextText === undefined
      ? {}
      : { contextText: storedPayload.contextText }),
    memo: plain(props.memo.rich_text),
    color,
    locator: {
      epubcfi: plain(props.epubcfi.rich_text),
      capturedProfile: profileName,
      byProfile
    },
    progress: props.progress.number ?? 0,
    createdAt,
    updatedAt: toEpochMs(props.updatedAt.date?.start, createdAt)
  }
}
