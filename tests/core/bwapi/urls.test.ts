import { describe, expect, test } from "vitest"

import {
  buildCriUrl,
  buildRicUrl,
  classifyBwApiUrl,
  fontProfileOf,
  parseCriQuery,
  type CriQuery
} from "~/core/bwapi/urls"

const CRI_URL =
  "https://viewer.bookwalker.jp/browserWebApi/cri" +
  "?cid=2450bba4-bee3-4db6-95db-e668c4c76fdd&u1=fc165442-0000-0000-0000-000000000000" +
  "&sfs=normal&sff=default&file=item%2Fxhtml%2Fp-003.xhtml&sidx=25&eidx=28" +
  "&BID=177815028231487709004NFBR"

const QUERY: CriQuery = {
  cid: "2450bba4-bee3-4db6-95db-e668c4c76fdd",
  u1: "fc165442-0000-0000-0000-000000000000",
  bid: "177815028231487709004NFBR",
  file: "item/xhtml/p-003.xhtml",
  sidx: 25,
  eidx: 28,
  sfs: "normal",
  sff: "default"
}

describe("classifyBwApiUrl", () => {
  test("recognises the marker and text endpoints", () => {
    expect(classifyBwApiUrl("https://viewer.bookwalker.jp/browserWebApi/gm?cid=x")).toBe("gm")
    expect(classifyBwApiUrl("https://viewer.bookwalker.jp/browserWebApi/pm")).toBe("pm")
    expect(classifyBwApiUrl(CRI_URL)).toBe("cri")
    expect(classifyBwApiUrl("https://viewer.bookwalker.jp/browserWebApi/ric?cfi=x")).toBe("ric")
    expect(classifyBwApiUrl("https://viewer.bookwalker.jp/browserWebApi/c?cid=x")).toBe("content")
  })

  test("accepts relative URLs, since XHR is often opened with a path only", () => {
    expect(classifyBwApiUrl("/browserWebApi/gm?cid=x")).toBe("gm")
    expect(classifyBwApiUrl("/browserWebApi/cri?cid=x")).toBe("cri")
  })

  test("the viewer version segment never decides the endpoint", () => {
    // A version lives in the path (`/03/30/`, `/browserWebApi/03/getLoader`);
    // only the segment right after `/browserWebApi/` may classify a request.
    expect(classifyBwApiUrl("https://viewer.bookwalker.jp/browserWebApi/03/getLoader")).toBe("unknown")
    expect(classifyBwApiUrl("https://viewer.bookwalker.jp/03/30/viewer.html?cid=x")).toBe("unknown")
    expect(classifyBwApiUrl("https://viewer.bookwalker.jp/04/31/js/config.js")).toBe("unknown")
  })

  test("unrelated and malformed URLs are unknown", () => {
    expect(classifyBwApiUrl("https://viewer.bookwalker.jp/browserWebApi/lpi")).toBe("unknown")
    expect(classifyBwApiUrl("https://example.com/gm")).toBe("unknown")
    expect(classifyBwApiUrl("::::")).toBe("unknown")
  })
})

describe("parseCriQuery", () => {
  test("reads the selection observed on the live viewer", () => {
    expect(parseCriQuery(CRI_URL)).toEqual(QUERY)
  })

  test("decodes the file parameter", () => {
    expect(parseCriQuery(CRI_URL)?.file).toBe("item/xhtml/p-003.xhtml")
  })

  test("a missing parameter yields null", () => {
    expect(parseCriQuery(CRI_URL.replace("&sidx=25", ""))).toBeNull()
    expect(parseCriQuery(CRI_URL.replace(/&BID=[^&]*/, ""))).toBeNull()
  })

  test("a non-integer region index yields null", () => {
    expect(parseCriQuery(CRI_URL.replace("sidx=25", "sidx=abc"))).toBeNull()
    expect(parseCriQuery(CRI_URL.replace("sidx=25", "sidx="))).toBeNull()
    expect(parseCriQuery(CRI_URL.replace("sidx=25", "sidx=2.5"))).toBeNull()
  })

  test("a font profile outside the known set yields null", () => {
    expect(parseCriQuery(CRI_URL.replace("sfs=normal", "sfs=huge"))).toBeNull()
    expect(parseCriQuery(CRI_URL.replace("sff=default", "sff=serif"))).toBeNull()
  })
})

describe("buildCriUrl / buildRicUrl", () => {
  test("buildCriUrl round trips through parseCriQuery", () => {
    expect(parseCriQuery(buildCriUrl(QUERY))).toEqual(QUERY)
  })

  test("buildCriUrl targets the /cri endpoint", () => {
    expect(classifyBwApiUrl(buildCriUrl(QUERY))).toBe("cri")
  })

  test("buildRicUrl carries the cfi anchor", () => {
    const url = buildRicUrl({
      cid: QUERY.cid,
      u1: QUERY.u1,
      bid: QUERY.bid,
      cfi: "epubcfi(/6/24!/4/2/8,/3:11,/3:15)",
      sfs: "large",
      sff: "default"
    })
    const params = new URL(url).searchParams

    expect(classifyBwApiUrl(url)).toBe("ric")
    expect(params.get("cfi")).toBe("epubcfi(/6/24!/4/2/8,/3:11,/3:15)")
    expect(params.get("sfs")).toBe("large")
  })
})

describe("fontProfileOf", () => {
  test("joins size and face the way the position map is keyed", () => {
    expect(fontProfileOf("normal", "default")).toBe("normal_default")
    expect(fontProfileOf("x-large", "default")).toBe("x-large_default")
  })
})
