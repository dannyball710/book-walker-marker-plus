import { access, readFile } from "node:fs/promises"
import path from "node:path"

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
}
