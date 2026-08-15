/**
 * Strict validation for Book Walker data on its way *into* our storage.
 *
 * Deliberately not applied to whole responses: `/gm` carries the account's full marker
 * list, including markers created elsewhere that this schema cannot model, so validating
 * a batch would reject data we only meant to read past. That path reads loosely per item
 * (`tryParseRawMarkerItem`) and keeps the original text.
 *
 * Hand-written rather than zod: the MAIN-world bridge imports this and runs at
 * `document_start` on every book open, so a validator library would be parsed and
 * executed before the viewer's own scripts. The shapes here are closed, small and fully
 * specified, which is exactly the case where a schema library earns least.
 */
import { isJstDate } from "~/core/marker/codec"
import {
  FONT_PROFILES,
  MARKER_COLORS,
  type FontProfile,
  type MarkerColor,
  type RawMarkerItem,
  type RicPage,
  type RicResponse
} from "~/core/marker/types"

import { BwApiError } from "./errors"

export { BwApiError }

type Read<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly string[] }

function asObject(value: unknown): object | null {
  return typeof value === "object" && value !== null ? value : null
}

function prop(target: object, key: string): unknown {
  return Reflect.get(target, key)
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

/** Rejects NaN and infinities: a region index or percentage is always a real number. */
function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

/**
 * A merely-string `date` would pass here and be rejected by the viewer instead, one
 * consumer later — where the failure is no longer per entry but takes the batch with it.
 */
function readJstDate(value: unknown): string | null {
  const date = readString(value)
  return date !== null && isJstDate(date) ? date : null
}

function readMarkerColor(value: unknown): MarkerColor | null {
  for (const color of MARKER_COLORS) {
    if (color === value) return color
  }
  return null
}

/** Records what was wrong so the thrown error can carry every problem, not just the first. */
function need<T>(
  value: T | null,
  field: string,
  expected: string,
  problems: string[]
): T | null {
  if (value === null) {
    problems.push(`${field} must be ${expected}`)
  }
  return value
}

/**
 * Unknown profile keys are dropped rather than rejected; the viewer may add one. A profile
 * we do model carrying a non-string is corrupt rather than unknown, so it is reported like
 * any other field — `/gm` hands `position` back to the viewer as its placement hint.
 */
function readPosition(
  value: unknown,
  problems: string[]
): { readonly [P in FontProfile]?: string } {
  const position: { -readonly [P in FontProfile]?: string } = {}
  const obj = asObject(value)
  if (obj === null) return position
  for (const profile of FONT_PROFILES) {
    const raw = prop(obj, profile)
    if (raw === undefined) continue
    const entry = need(
      readString(raw),
      `appendix.browser.position.${profile}`,
      "a string",
      problems
    )
    if (entry !== null) position[profile] = entry
  }
  return position
}

function readRawMarkerItem(json: unknown): Read<RawMarkerItem> {
  const obj = asObject(json)
  if (obj === null) return { ok: false, problems: ["expected an object"] }

  const problems: string[] = []
  const id = need(readString(prop(obj, "id")), "id", "a string", problems)
  const epubcfi = need(readString(prop(obj, "epubcfi")), "epubcfi", "a string", problems)
  const text = need(readString(prop(obj, "text")), "text", "a string", problems)
  const memo = need(readString(prop(obj, "memo")), "memo", "a string", problems)
  const date = need(
    readJstDate(prop(obj, "date")),
    "date",
    "an ISO8601 date with a numeric UTC offset",
    problems
  )
  const pr = need(readNumber(prop(obj, "pr")), "pr", "a number", problems)
  const color = need(
    readMarkerColor(prop(obj, "color")),
    "color",
    "one of the viewer's four colours",
    problems
  )
  if (prop(obj, "shape") !== "rect") {
    problems.push('shape must be "rect"')
  }

  const appendix = asObject(prop(obj, "appendix"))
  const browser = appendix === null ? null : asObject(prop(appendix, "browser"))
  if (browser === null) {
    problems.push("appendix.browser must be an object")
  }
  const sidx = browser === null ? null : need(readNumber(prop(browser, "sidx")), "appendix.browser.sidx", "a number", problems)
  const eidx = browser === null ? null : need(readNumber(prop(browser, "eidx")), "appendix.browser.eidx", "a number", problems)
  const sFile = browser === null ? null : need(readString(prop(browser, "sFile")), "appendix.browser.sFile", "a string", problems)
  const eFile = browser === null ? null : need(readString(prop(browser, "eFile")), "appendix.browser.eFile", "a string", problems)
  const position: { readonly [P in FontProfile]?: string } =
    browser === null ? {} : readPosition(prop(browser, "position"), problems)

  if (
    id === null ||
    epubcfi === null ||
    text === null ||
    memo === null ||
    date === null ||
    pr === null ||
    color === null ||
    browser === null ||
    sidx === null ||
    eidx === null ||
    sFile === null ||
    eFile === null ||
    problems.length > 0
  ) {
    return { ok: false, problems }
  }

  return {
    ok: true,
    value: {
      id,
      epubcfi,
      text,
      memo,
      color,
      shape: "rect",
      date,
      pr,
      appendix: {
        browser: {
          sidx,
          sFile,
          eidx,
          eFile,
          position
        }
      }
    }
  }
}

function readRicPage(json: unknown): Read<RicPage> {
  const obj = asObject(json)
  if (obj === null) return { ok: false, problems: ["expected an object"] }

  const problems: string[] = []
  const file = need(readString(prop(obj, "file")), "file", "a string", problems)
  const sidx = need(readNumber(prop(obj, "sidx")), "sidx", "a number", problems)
  const eidx = need(readNumber(prop(obj, "eidx")), "eidx", "a number", problems)

  if (file === null || sidx === null || eidx === null) {
    return { ok: false, problems }
  }
  return { ok: true, value: { file, sidx, eidx } }
}

function readRicResponse(json: unknown): Read<RicResponse> {
  const obj = asObject(json)
  if (obj === null) return { ok: false, problems: ["expected an object"] }

  const problems: string[] = []
  // The WebAPI signals failure in the body, not the HTTP code (see the faked /pm success
  // body). Accepting a non-200 status would write a bogus locator and, because the sweep
  // would count it as a success, never retry it.
  const status = need(readString(prop(obj, "status")), "status", "a string", problems)
  if (status !== null && status !== "200") {
    problems.push(`status must be "200", got "${status}"`)
  }
  const file = need(readString(prop(obj, "file")), "file", "a string", problems)
  const sidx = need(readNumber(prop(obj, "sidx")), "sidx", "a number", problems)
  const eidx = need(readNumber(prop(obj, "eidx")), "eidx", "a number", problems)

  const rawPages = prop(obj, "pages")
  const pages: RicPage[] = []
  if (!Array.isArray(rawPages)) {
    problems.push("pages must be an array")
  } else {
    for (const [index, entry] of rawPages.entries()) {
      const page = readRicPage(entry)
      if (page.ok) {
        pages.push(page.value)
      } else {
        problems.push(`pages[${index}]: ${page.problems.join(", ")}`)
      }
    }
  }

  if (
    status === null ||
    file === null ||
    sidx === null ||
    eidx === null ||
    problems.length > 0
  ) {
    return { ok: false, problems }
  }
  return { ok: true, value: { status, file, sidx, eidx, pages } }
}

function orThrow<T>(result: Read<T>, what: string): T {
  if (!result.ok) {
    throw new BwApiError(`invalid ${what}: ${result.problems.join("; ")}`, {
      cause: result.problems
    })
  }
  return result.value
}

export function parseRicResponse(json: unknown): RicResponse {
  return orThrow(readRicResponse(json), "/ric response")
}

/**
 * Non-throwing: an item that fails validation is skipped rather than voiding the batch
 * it arrived in, because a batch is a full account snapshot we only meant to read past.
 */
export function tryParseRawMarkerItem(json: unknown): RawMarkerItem | null {
  const result = readRawMarkerItem(json)
  return result.ok ? result.value : null
}
