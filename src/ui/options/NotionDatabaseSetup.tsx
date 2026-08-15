import { useEffect, useState } from "react"

import { t } from "~/core/i18n"
import type {
  NotionDatabaseSummary,
  NotionPropertyType,
  NotionSchemaIssue,
  NotionSchemaStatus
} from "~/core/notion/types"
import { Icon } from "~/ui/Icon"
import {
  configureNotionDatabase,
  inspectNotionDatabase,
  searchNotionDatabases
} from "~/ui/messages"
import {
  buttonDangerSolid,
  buttonQuiet,
  buttonSecondary,
  cx,
  errorBox,
  fieldControl,
  spinner
} from "~/ui/styles"

const TECHNICAL_FIELDS: readonly string[] = [
  "bookId",
  "markerId",
  "epubcfi",
  "capturedProfile",
  "file",
  "eFile",
  "sidx",
  "eidx",
  "position",
  "byProfile",
  "color",
  "progress",
  "createdAt",
  "updatedAt"
]

export interface NotionDatabaseSetupProps {
  readonly pat: string
  readonly databaseId: string
  readonly onDatabaseIdChange: (databaseId: string) => void
  readonly origins: readonly string[]
  readonly issue?: string | undefined
}

type SearchState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | {
      readonly kind: "loaded"
      readonly databases: readonly NotionDatabaseSummary[]
      readonly hasMore: boolean
    }
  | { readonly kind: "failed"; readonly message: string }

type SchemaState =
  | { readonly kind: "idle" }
  | { readonly kind: "checking" }
  | {
      readonly kind: "ready"
      readonly status: NotionSchemaStatus
      readonly configured: boolean
    }
  | { readonly kind: "configuring" }
  | { readonly kind: "failed"; readonly message: string }

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

function propertyTypeLabel(type: NotionPropertyType): string {
  switch (type) {
    case "title":
      return t("notionPropertyTypeTitle")
    case "rich_text":
      return t("notionPropertyTypeRichText")
    case "number":
      return t("notionPropertyTypeNumber")
    case "select":
      return t("notionPropertyTypeSelect")
    case "date":
      return t("notionPropertyTypeDate")
  }
}

function currentTypeLabel(type: string | null): string {
  switch (type) {
    case "title":
    case "rich_text":
    case "number":
    case "select":
    case "date":
      return propertyTypeLabel(type)
    default:
      return type ?? ""
  }
}

function issueText(issue: NotionSchemaIssue): string {
  if (issue.kind === "missing") {
    return t("notionSchemaMissing", {
      property: issue.property,
      type: propertyTypeLabel(issue.expected)
    })
  }
  if (issue.kind === "title_name") {
    return t("notionSchemaTitleRename", {
      current: issue.actual ?? "",
      property: issue.property
    })
  }
  return t("notionSchemaWrongType", {
    property: issue.property,
    current: currentTypeLabel(issue.actual),
    expected: propertyTypeLabel(issue.expected)
  })
}

export function NotionDatabaseSetup(props: NotionDatabaseSetupProps) {
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<NotionDatabaseSummary | null>(null)
  const [search, setSearch] = useState<SearchState>({ kind: "idle" })
  const [schema, setSchema] = useState<SchemaState>({ kind: "idle" })
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    setSelected(null)
    setSearch({ kind: "idle" })
    setSchema({ kind: "idle" })
    setConfirming(false)
  }, [props.pat])

  const requestPermission = (granted: () => void, denied: () => void) => {
    if (props.origins.length === 0) {
      granted()
      return
    }
    chrome.permissions
      .request({ origins: [...props.origins] })
      .then((allowed) => (allowed ? granted() : denied()))
      .catch(denied)
  }

  const inspect = (databaseId: string) => {
    setSchema({ kind: "checking" })
    setConfirming(false)
    inspectNotionDatabase(props.pat, databaseId)
      .then(({ status }) =>
        setSchema({ kind: "ready", status, configured: false })
      )
      .catch((cause: unknown) =>
        setSchema({ kind: "failed", message: describe(cause) })
      )
  }

  const runSearch = () => {
    setSearch({ kind: "loading" })
    setSchema({ kind: "idle" })
    setConfirming(false)
    searchNotionDatabases(props.pat, query)
      .then((result) => {
        setSearch({ kind: "loaded", ...result })
        const current = result.databases.find(
          (database) => database.id === props.databaseId
        )
        if (current !== undefined) {
          setSelected(current)
          inspect(current.id)
        }
      })
      .catch((cause: unknown) =>
        setSearch({ kind: "failed", message: describe(cause) })
      )
  }

  /** Permission request must stay directly on the click's call stack. */
  const searchDatabases = () => {
    requestPermission(runSearch, () =>
      setSearch({ kind: "failed", message: t("notionPermissionDenied") })
    )
  }

  const checkSelected = () => {
    requestPermission(
      () => inspect(props.databaseId),
      () => setSchema({ kind: "failed", message: t("notionPermissionDenied") })
    )
  }

  const configure = () => {
    setSchema({ kind: "configuring" })
    configureNotionDatabase(props.pat, props.databaseId)
      .then(({ status }) => {
        setSchema({ kind: "ready", status, configured: true })
        setConfirming(false)
      })
      .catch((cause: unknown) => {
        setSchema({ kind: "failed", message: describe(cause) })
        setConfirming(false)
      })
  }

  const confirmConfigure = () => {
    requestPermission(configure, () => {
      setSchema({ kind: "failed", message: t("notionPermissionDenied") })
      setConfirming(false)
    })
  }

  const loaded = search.kind === "loaded" ? search : null
  const ready = schema.kind === "ready" ? schema : null
  const selectedTitle = selected?.title.trim() || t("notionDatabaseUntitled")
  const notionUrl = `https://www.notion.so/${props.databaseId.replaceAll("-", "")}`

  return (
    <section className="grid gap-3 border-t border-line pt-4">
      <header>
        <h3 className="m-0 text-xs font-semibold text-ink-soft">
          {t("notionDatabasePickerTitle")}
        </h3>
      </header>

      <div className="flex items-stretch gap-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">{t("notionDatabaseSearchLabel")}</span>
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" aria-hidden="true">
            <Icon name="search" size={16} />
          </span>
          <input
            type="search"
            className={`${fieldControl} pl-9`}
            value={query}
            placeholder={t("notionDatabaseSearchPlaceholder")}
            aria-label={t("notionDatabaseSearchLabel")}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && props.pat.trim() !== "") {
                event.preventDefault()
                searchDatabases()
              }
            }}
          />
        </label>
        <button
          type="button"
          className={buttonSecondary}
          disabled={props.pat.trim() === "" || search.kind === "loading"}
          onClick={searchDatabases}>
          {search.kind === "loading" && <span className={spinner} />}
          {t("notionDatabaseSearchButton")}
        </button>
      </div>

      {loaded !== null && loaded.databases.length > 0 && (
        <div className="grid max-h-60 gap-1.5 overflow-y-auto rounded-ui-sm border border-line bg-surface p-1.5">
          {loaded.databases.map((database) => {
            const active = database.id === props.databaseId
            const title = database.title.trim() || t("notionDatabaseUntitled")
            return (
              <button
                key={database.id}
                type="button"
                className={cx(
                  "grid min-h-11 cursor-pointer grid-cols-[1fr_auto] items-center gap-2 rounded-ui-sm border border-transparent bg-transparent px-2.5 py-2 text-left transition hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/40",
                  active && "border-accent/40 bg-surface-tinted"
                )}
                aria-pressed={active}
                onClick={() => {
                  setSelected(database)
                  props.onDatabaseIdChange(database.id)
                  inspect(database.id)
                }}>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-ink">
                    {title}
                  </span>
                  <span className="mt-0.5 block truncate font-mono text-[9px] text-subtle">
                    {database.id}
                  </span>
                </span>
                {active && <Icon name="check" size={16} />}
              </button>
            )
          })}
        </div>
      )}

      {loaded !== null && loaded.databases.length === 0 && (
        <p className="m-0 rounded-ui-sm border border-dashed border-line px-3 py-5 text-center text-[11px] text-muted">
          {t("notionDatabaseSearchEmpty")}
        </p>
      )}
      {loaded?.hasMore === true && (
        <p className="m-0 text-[10px] text-muted">
          {t("notionDatabaseSearchMore")}
        </p>
      )}
      {search.kind === "failed" && <p className={errorBox}>{search.message}</p>}

      {props.databaseId !== "" && (
        <div className="flex items-center justify-between gap-3 rounded-ui-sm border border-line bg-surface px-3 py-2.5">
          <span className="min-w-0">
            <span className="block text-[9px] font-semibold text-muted">
              {t("notionDatabaseSelected")}
            </span>
            <span className="block truncate text-xs font-semibold text-ink" title={selected?.title || props.databaseId}>
              {selected === null ? props.databaseId : selectedTitle}
            </span>
          </span>
          {schema.kind === "idle" && (
            <button type="button" className={buttonQuiet} onClick={checkSelected}>
              {t("notionSchemaCheck")}
            </button>
          )}
        </div>
      )}

      {schema.kind === "checking" && (
        <p className="m-0 flex items-center gap-2 text-[11px] text-muted" role="status">
          <span className={spinner} />
          {t("notionSchemaChecking")}
        </p>
      )}
      {schema.kind === "configuring" && (
        <p className="m-0 flex items-center gap-2 text-[11px] text-warning" role="status">
          <span className={spinner} />
          {t("notionSchemaConfiguring")}
        </p>
      )}
      {schema.kind === "failed" && <p className={errorBox}>{schema.message}</p>}

      {ready?.status.compatible === true && (
        <>
          <p className="m-0 flex items-center gap-2 rounded-ui-sm border border-success/25 bg-success/10 px-3 py-2.5 text-[11px] text-success" role="status">
            <Icon name="check" size={16} />
            {ready.configured
              ? t("notionSchemaConfigured")
              : t("notionSchemaCompatible")}
          </p>
          <div className="grid gap-2.5 rounded-ui-sm border border-line bg-surface px-3 py-3">
            <strong className="text-[11px] text-ink-soft">
              {t("notionTechnicalFieldsTitle")}
            </strong>
            <p className="m-0 text-[10px] leading-5 text-muted">
              {t("notionTechnicalFieldsBody")}
            </p>
            <div className="flex flex-wrap gap-1">
              {TECHNICAL_FIELDS.map((field) => (
                <code
                  key={field}
                  className="rounded bg-surface-soft px-1.5 py-0.5 text-[9px] text-muted">
                  {field}
                </code>
              ))}
            </div>
            <a
              className={`${buttonSecondary} justify-self-start no-underline`}
              href={notionUrl}
              target="_blank"
              rel="noreferrer">
              {t("notionOpenDatabase")}
            </a>
          </div>
        </>
      )}

      {ready !== null && !ready.status.compatible && (
        <div className="grid gap-2.5 rounded-ui-sm border border-warning/30 bg-warning/10 px-3 py-2.5">
          <strong className="text-[11px] text-warning">
            {t("notionSchemaIncompatible")}
          </strong>
          <ul className="m-0 grid max-h-36 gap-1 overflow-y-auto pl-4 text-[10px] leading-5 text-muted">
            {ready.status.issues.map((issue) => (
              <li key={`${issue.kind}:${issue.property}`}>{issueText(issue)}</li>
            ))}
          </ul>
          {!confirming && (
            <button
              type="button"
              className={buttonDangerSolid}
              onClick={() => setConfirming(true)}>
              {t("notionSchemaConfigureButton")}
            </button>
          )}
        </div>
      )}

      {confirming && (
        <div className="grid gap-2.5 rounded-ui-sm border border-danger/40 bg-danger-soft px-3 py-3 text-danger" role="alert">
          <strong className="text-xs">{t("notionConfigureDangerTitle")}</strong>
          <p className="m-0 text-[11px] leading-5">
            {t("notionConfigureDangerBody")}
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={buttonQuiet}
              onClick={() => setConfirming(false)}>
              {t("commonCancel")}
            </button>
            <button
              type="button"
              className={buttonDangerSolid}
              onClick={confirmConfigure}>
              {t("notionConfigureConfirm")}
            </button>
          </div>
        </div>
      )}

      {props.issue !== undefined && <p className={errorBox}>{props.issue}</p>}
    </section>
  )
}
