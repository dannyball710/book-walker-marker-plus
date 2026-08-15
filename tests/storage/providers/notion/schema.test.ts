import { describe, expect, it } from "vitest"

import type { NotionDatabaseProperty } from "~/storage/providers/notion/schema"
import { planNotionSchema } from "~/storage/providers/notion/schema"

const required: readonly NotionDatabaseProperty[] = [
  { id: "title", name: "Text", type: "title" },
  { id: "memo", name: "Note", type: "rich_text" },
  { id: "book-title", name: "Book", type: "rich_text" },
  { id: "book-id", name: "bookId", type: "rich_text" },
  { id: "marker-id", name: "markerId", type: "rich_text" },
  { id: "cfi", name: "epubcfi", type: "rich_text" },
  { id: "profile", name: "capturedProfile", type: "select" },
  { id: "file", name: "file", type: "rich_text" },
  { id: "end-file", name: "eFile", type: "rich_text" },
  { id: "start-index", name: "sidx", type: "number" },
  { id: "end-index", name: "eidx", type: "number" },
  { id: "position", name: "position", type: "rich_text" },
  { id: "profiles", name: "byProfile", type: "rich_text" },
  { id: "color", name: "color", type: "select" },
  { id: "progress", name: "progress", type: "number" },
  { id: "created", name: "createdAt", type: "date" },
  { id: "updated", name: "updatedAt", type: "date" }
]

describe("planNotionSchema", () => {
  it("leaves a compatible database untouched", () => {
    expect(planNotionSchema(required)).toEqual({
      status: { compatible: true, issues: [], mayDestroyData: false },
      properties: {}
    })
  })

  it("adds missing properties without claiming data loss", () => {
    const plan = planNotionSchema(required.filter((property) => property.name !== "Note"))
    expect(plan.status.compatible).toBe(false)
    expect(plan.status.mayDestroyData).toBe(false)
    expect(plan.properties).toMatchObject({ Note: { rich_text: {} } })
    expect(plan.status.issues).toContainEqual({
      kind: "missing",
      property: "Note",
      expected: "rich_text",
      actual: null
    })
  })

  it("renames the existing title property instead of adding a second title", () => {
    const properties = required.map((property) =>
      property.type === "title" ? { ...property, name: "Name" } : property
    )
    const plan = planNotionSchema(properties)
    expect(plan.properties.title).toEqual({ name: "Text" })
    expect(plan.status.issues).toContainEqual({
      kind: "title_name",
      property: "Text",
      expected: "title",
      actual: "Name"
    })
  })

  it("deletes a conflicting Text property before renaming the title", () => {
    const properties = [
      ...required.map((property) =>
        property.type === "title" ? { ...property, name: "Name" } : property
      ),
      { id: "conflict", name: "Text", type: "rich_text" }
    ]
    const plan = planNotionSchema(properties)
    expect(plan.properties.conflict).toBeNull()
    expect(plan.properties.title).toEqual({ name: "Text" })
    expect(plan.status.mayDestroyData).toBe(true)
  })

  it("renames fields from another locale without destroying their values", () => {
    const names: Readonly<Record<string, string>> = {
      Text: "原文",
      Note: "備註",
      Book: "書籍"
    }
    const localized = required.map((property) => ({
      ...property,
      name: names[property.name] ?? property.name
    }))

    const plan = planNotionSchema(localized)

    expect(plan.status.compatible).toBe(false)
    expect(plan.status.mayDestroyData).toBe(false)
    expect(plan.properties.title).toEqual({ name: "Text" })
    expect(plan.properties.memo).toEqual({ name: "Note" })
    expect(plan.properties["book-title"]).toEqual({ name: "Book" })
  })

  it("changes an incompatible property type and marks the plan destructive", () => {
    const properties = required.map((property) =>
      property.name === "progress"
        ? { ...property, type: "rich_text" }
        : property
    )
    const plan = planNotionSchema(properties)
    expect(plan.properties.progress).toEqual({ name: "progress", number: {} })
    expect(plan.status.mayDestroyData).toBe(true)
    expect(plan.status.issues).toContainEqual({
      kind: "wrong_type",
      property: "progress",
      expected: "number",
      actual: "rich_text"
    })
  })
})
