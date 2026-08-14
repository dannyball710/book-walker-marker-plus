/**
 * URL classification and query building for the BOOK☆WALKER browserWebApi.
 * The viewer path carries a version segment (`/03/30/`), so classification
 * looks only at the segment right after `/browserWebApi/`.
 */
import type { FontFace, FontProfile, FontSize } from "~/core/marker/types"

const API_ORIGIN = "https://viewer.bookwalker.jp"
const API_PATH = "/browserWebApi/"
const API_BASE = `${API_ORIGIN}${API_PATH.slice(0, -1)}`

export type BwEndpoint = "gm" | "pm" | "cri" | "ric" | "content" | "unknown"

export interface CriQuery {
  readonly cid: string
  readonly u1: string
  readonly bid: string
  readonly file: string
  readonly sidx: number
  readonly eidx: number
  readonly sfs: FontSize
  readonly sff: FontFace
}

export interface RicQuery {
  readonly cid: string
  readonly u1: string
  readonly bid: string
  readonly cfi: string
  readonly sfs: FontSize
  readonly sff: FontFace
}

export function classifyBwApiUrl(url: string): BwEndpoint {
  const parsed = toUrl(url)
  if (parsed === null || !parsed.pathname.startsWith(API_PATH)) return "unknown"
  const segment = parsed.pathname.slice(API_PATH.length).split("/")[0]
  switch (segment) {
    case "gm":
      return "gm"
    case "pm":
      return "pm"
    case "cri":
      return "cri"
    case "ric":
      return "ric"
    case "c":
      return "content"
    default:
      return "unknown"
  }
}

export function parseCriQuery(url: string): CriQuery | null {
  const parsed = toUrl(url)
  if (parsed === null) return null

  const query = parsed.searchParams
  const cid = query.get("cid")
  const u1 = query.get("u1")
  const bid = query.get("BID")
  const file = query.get("file")
  const sidx = toInteger(query.get("sidx"))
  const eidx = toInteger(query.get("eidx"))
  const sfs = toFontSize(query.get("sfs"))
  const sff = toFontFace(query.get("sff"))

  if (
    cid === null ||
    u1 === null ||
    bid === null ||
    file === null ||
    sidx === null ||
    eidx === null ||
    sfs === null ||
    sff === null
  ) {
    return null
  }
  return { cid, u1, bid, file, sidx, eidx, sfs, sff }
}

export function buildCriUrl(q: CriQuery): string {
  const query = new URLSearchParams()
  query.set("cid", q.cid)
  query.set("u1", q.u1)
  query.set("sfs", q.sfs)
  query.set("sff", q.sff)
  query.set("file", q.file)
  query.set("sidx", String(q.sidx))
  query.set("eidx", String(q.eidx))
  query.set("BID", q.bid)
  return `${API_BASE}/cri?${query.toString()}`
}

export function buildRicUrl(q: RicQuery): string {
  const query = new URLSearchParams()
  query.set("cid", q.cid)
  query.set("u1", q.u1)
  query.set("sfs", q.sfs)
  query.set("sff", q.sff)
  query.set("cfi", q.cfi)
  query.set("BID", q.bid)
  return `${API_BASE}/ric?${query.toString()}`
}

export function fontProfileOf(sfs: FontSize, sff: FontFace): FontProfile {
  return `${sfs}_${sff}`
}

function toUrl(url: string): URL | null {
  try {
    return new URL(url, API_ORIGIN)
  } catch {
    return null
  }
}

function toInteger(value: string | null): number | null {
  if (value === null || value.trim().length === 0) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : null
}

function toFontSize(value: string | null): FontSize | null {
  switch (value) {
    case "small":
    case "normal":
    case "large":
    case "x-large":
      return value
    default:
      return null
  }
}

function toFontFace(value: string | null): FontFace | null {
  return value === "default" ? value : null
}
