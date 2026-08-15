import { access, copyFile } from "node:fs/promises"
import path from "node:path"

const buildRoot = process.argv[2] ?? "build/chrome-mv3-prod"
await access(path.join(buildRoot, "manifest.json"))
await copyFile("LICENSE", path.join(buildRoot, "LICENSE"))
console.log(`Copied LICENSE into ${buildRoot}.`)
