import { describe, expect, it } from "vitest"

import type { NotionDatabaseProperty } from "~/storage/providers/notion/schema"
import { planNotionSchema } from "~/storage/providers/notion/schema"

const required: readonly NotionDatabaseProperty[] = [
  { id: "title", name: "原文", type: "title" },
  { id: "memo", name: "備註", type: "rich_text" },
  { id: "book-title", name: "書籍", type: "rich_text" },
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
    const plan = planNotionSchema(required.filter((property) => property.name !== "備註"))
    expect(plan.status.compatible).toBe(false)
    expect(plan.status.mayDestroyData).toBe(false)
    expect(plan.properties).toMatchObject({ 備註: { rich_text: {} } })
    expect(plan.status.issues).toContainEqual({
      kind: "missing",
      property: "備註",
      expected: "rich_text",
      actual: null
    })
  })

  it("renames the existing title property instead of adding a second title", () => {
    const properties = required.map((property) =>
      property.type === "title" ? { ...property, name: "Name" } : property
    )
    const plan = planNotionSchema(properties)
    expect(plan.properties.title).toEqual({ name: "原文" })
    expect(plan.status.issues).toContainEqual({
      kind: "title_name",
      property: "原文",
      expected: "title",
      actual: "Name"
    })
  })

  it("deletes a conflicting 原文 before renaming the title", () => {
    const properties = [
      ...required.map((property) =>
        property.type === "title" ? { ...property, name: "Name" } : property
      ),
      { id: "conflict", name: "原文", type: "rich_text" }
    ]
    const plan = planNotionSchema(properties)
    expect(plan.properties.conflict).toBeNull()
    expect(plan.properties.title).toEqual({ name: "原文" })
    expect(plan.status.mayDestroyData).toBe(true)
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
