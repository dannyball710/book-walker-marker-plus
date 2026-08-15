import { access, readFile } from "node:fs/promises"
import path from "node:path"
import { runInNewContext } from "node:vm"

const buildRoot = process.argv[2] ?? "build/chrome-mv3-prod"
const manifestPath = path.join(buildRoot, "manifest.json")
const manifest = JSON.parse(await readFile(manifestPath, "utf8"))
const references = new Set(["LICENSE"])

function add(reference) {
  if (typeof reference === "string" && reference !== "") {
    references.add(reference)
  }
}

function addValues(record) {
  if (record !== undefined && record !== null && typeof record === "object") {
    for (const value of Object.values(record)) {
      add(value)
    }
  }
}

addValues(manifest.icons)
addValues(manifest.action?.default_icon)
add(manifest.background?.service_worker)
add(manifest.options_ui?.page)
add(manifest.side_panel?.default_path)

for (const contentScript of manifest.content_scripts ?? []) {
  for (const file of contentScript.js ?? []) add(file)
  for (const file of contentScript.css ?? []) add(file)
}

for (const resourceGroup of manifest.web_accessible_resources ?? []) {
  for (const file of resourceGroup.resources ?? []) add(file)
}

if (typeof manifest.default_locale === "string") {
  add(`_locales/${manifest.default_locale}/messages.json`)
}

function chromeApiStub() {
  let api
  const callable = function () {}
  api = new Proxy(callable, {
    get(target, property) {
      if (Reflect.has(target, property)) {
        return Reflect.get(target, property)
      }
      // Prevent the recursive proxy from being treated as a Promise.
      if (property === "then") return undefined
      return api
    },
    apply() {
      return Promise.resolve(undefined)
    }
  })
  api.i18n = { getMessage: () => "" }
  return api
}

function verifyServiceWorker(code, filename) {
  const sandbox = {
    chrome: chromeApiStub(),
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval
  }
  const webGlobals = [
    "AbortController",
    "Blob",
    "Headers",
    "Request",
    "Response",
    "URL",
    "URLSearchParams",
    "TextDecoder",
    "TextEncoder",
    "TransformStream",
    "ReadableStream",
    "WritableStream",
    "crypto",
    "fetch",
    "performance",
    "structuredClone",
    "queueMicrotask",
    "atob",
    "btoa"
  ]
  for (const name of webGlobals) {
    if (globalThis[name] !== undefined) sandbox[name] = globalThis[name]
  }

  runInNewContext(code, sandbox, { filename, timeout: 5_000 })
}

const missing = []
for (const reference of references) {
  try {
    await access(path.join(buildRoot, reference))
  } catch {
    missing.push(reference)
  }
}

if (missing.length > 0) {
  console.error("Required files are missing from the production build:")
  for (const reference of missing.sort()) {
    console.error(`- ${reference}`)
  }
  process.exitCode = 1
} else {
  console.log(`Verified ${references.size} required package files in ${buildRoot}.`)

  const serviceWorker = manifest.background?.service_worker
  if (typeof serviceWorker === "string") {
    const serviceWorkerPath = path.join(buildRoot, serviceWorker)
    const serviceWorkerCode = await readFile(serviceWorkerPath, "utf8")
    try {
      verifyServiceWorker(serviceWorkerCode, serviceWorker)
      console.log(`Verified service worker startup for ${serviceWorker}.`)
    } catch (error) {
      console.error(`Service worker startup failed for ${serviceWorker}:`)
      console.error(error)
      process.exitCode = 1
    }
  }
}
