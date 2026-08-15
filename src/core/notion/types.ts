export type NotionPropertyType =
  | "title"
  | "rich_text"
  | "number"
  | "select"
  | "date"

export interface NotionDatabaseSummary {
  readonly id: string
  readonly title: string
  readonly url: string | null
}

export type NotionSchemaIssueKind = "missing" | "wrong_type" | "title_name"

export interface NotionSchemaIssue {
  readonly kind: NotionSchemaIssueKind
  readonly property: string
  readonly expected: NotionPropertyType
  readonly actual: string | null
}

export interface NotionSchemaStatus {
  readonly compatible: boolean
  readonly issues: readonly NotionSchemaIssue[]
  /** Type changes or deleting a name conflict can make existing values unreadable. */
  readonly mayDestroyData: boolean
}
