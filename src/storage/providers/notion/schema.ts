import type {
  NotionPropertyType,
  NotionSchemaIssue,
  NotionSchemaStatus
} from "~/core/notion/types"
import { PROP } from "~/storage/providers/notion/mapping"

export interface NotionDatabaseProperty {
  readonly id: string
  readonly name: string
  readonly type: string
}

type EmptyConfig = { readonly [key: string]: never }

export type NotionPropertyUpdate =
  | null
  | { readonly name: string }
  | { readonly name?: string; readonly title: EmptyConfig }
  | { readonly name?: string; readonly rich_text: EmptyConfig }
  | { readonly name?: string; readonly number: EmptyConfig }
  | { readonly name?: string; readonly select: EmptyConfig }
  | { readonly name?: string; readonly date: EmptyConfig }

export interface NotionPropertyPatch {
  [propertyNameOrId: string]: NotionPropertyUpdate
}

export interface NotionSchemaPlan {
  readonly status: NotionSchemaStatus
  readonly properties: NotionPropertyPatch
}

const REQUIRED_PROPERTIES: readonly {
  readonly name: string
  readonly type: NotionPropertyType
}[] = [
  { name: PROP.text, type: "title" },
  { name: PROP.memo, type: "rich_text" },
  { name: PROP.bookTitle, type: "rich_text" },
  { name: PROP.bookId, type: "rich_text" },
  { name: PROP.markerId, type: "rich_text" },
  { name: PROP.epubcfi, type: "rich_text" },
  { name: PROP.capturedProfile, type: "select" },
  { name: PROP.file, type: "rich_text" },
  { name: PROP.eFile, type: "rich_text" },
  { name: PROP.sidx, type: "number" },
  { name: PROP.eidx, type: "number" },
  { name: PROP.position, type: "rich_text" },
  { name: PROP.byProfile, type: "rich_text" },
  { name: PROP.color, type: "select" },
  { name: PROP.progress, type: "number" },
  { name: PROP.createdAt, type: "date" },
  { name: PROP.updatedAt, type: "date" }
]

function updateFor(type: NotionPropertyType, name?: string): NotionPropertyUpdate {
  const named = name === undefined ? {} : { name }
  switch (type) {
    case "title":
      return { ...named, title: {} }
    case "rich_text":
      return { ...named, rich_text: {} }
    case "number":
      return { ...named, number: {} }
    case "select":
      return { ...named, select: {} }
    case "date":
      return { ...named, date: {} }
  }
}

export function planNotionSchema(
  properties: readonly NotionDatabaseProperty[]
): NotionSchemaPlan {
  const patch: NotionPropertyPatch = {}
  const issues: NotionSchemaIssue[] = []
  let mayDestroyData = false
  const byName = new Map(properties.map((property) => [property.name, property]))
  const title = properties.find((property) => property.type === "title")

  for (const required of REQUIRED_PROPERTIES) {
    if (required.type === "title") {
      if (title === undefined) {
        patch[required.name] = updateFor("title")
        issues.push({
          kind: "missing",
          property: required.name,
          expected: "title",
          actual: null
        })
        continue
      }
      if (title.name === required.name) {
        continue
      }

      const conflict = byName.get(required.name)
      if (conflict !== undefined && conflict.id !== title.id) {
        patch[conflict.id] = null
        mayDestroyData = true
      }
      patch[title.id] = { name: required.name }
      issues.push({
        kind: "title_name",
        property: required.name,
        expected: "title",
        actual: title.name
      })
      continue
    }

    const existing = byName.get(required.name)
    if (existing === undefined) {
      patch[required.name] = updateFor(required.type)
      issues.push({
        kind: "missing",
        property: required.name,
        expected: required.type,
        actual: null
      })
      continue
    }
    if (existing.type !== required.type) {
      patch[existing.id] = updateFor(required.type, required.name)
      mayDestroyData = true
      issues.push({
        kind: "wrong_type",
        property: required.name,
        expected: required.type,
        actual: existing.type
      })
    }
  }

  return {
    status: {
      compatible: issues.length === 0,
      issues,
      mayDestroyData
    },
    properties: patch
  }
}
