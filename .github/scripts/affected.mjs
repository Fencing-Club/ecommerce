// Which deployable apps a change affects, for CI to decide what to test and deploy. An app is affected when code changed
// in it or in a workspace package it depends on, or when the change touches what every app shares (the workflows, the
// lockfile, the root configs). Docs, Markdown and design files never affect one.
//
// node .github/scripts/affected.mjs <base commit> [head commit]
// prints, and appends to $GITHUB_OUTPUT, one `<output>=true|false` line per app.
import { execFileSync } from "node:child_process"
import { appendFileSync, readdirSync, readFileSync, existsSync } from "node:fs"
import path from "node:path"

// Each CI output and the workspace package it reports on.
const apps = { copacker: "copacker", "fc-theme": "@repo/fc-theme-base" }

// Files every app builds, tests or deploys with.
const shared = [
  /^Dockerfile(?:\..+)?$/,
  /^\.dockerignore$/,
  /^\.github\//,
  /^package\.json$/,
  /^pnpm-lock\.yaml$/,
  /^pnpm-workspace\.yaml$/,
  /^\.npmrc$/,
  /^\.nvmrc$/,
  /^turbo\.json$/,
  /^knip\.json$/,
  /^vite\.config\.ts$/
]
const notCode = [/(^|\/)docs\//, /\.md$/, /\.pen$/]

// Each workspace package's folder and the workspace packages it depends on.
function workspace() {
  const packages = new Map()
  for (const group of ["apps", "packages"]) {
    for (const folder of existsSync(group) ? readdirSync(group) : []) {
      const file = path.posix.join(group, folder, "package.json")
      if (!existsSync(file)) continue
      const manifest = JSON.parse(readFileSync(file, "utf8"))
      const dependencies = { ...manifest.dependencies, ...manifest.devDependencies }
      packages.set(manifest.name, {
        folder: `${group}/${folder}/`,
        uses: Object.entries(dependencies)
          .filter(([, version]) => String(version).startsWith("workspace:"))
          .map(([name]) => name)
      })
    }
  }
  return packages
}

// The folders of an app and everything it depends on in the workspace.
function folders(app, packages) {
  const found = new Set()
  const visit = (name) => {
    const entry = packages.get(name)
    if (!entry || found.has(entry.folder)) return
    found.add(entry.folder)
    entry.uses.forEach(visit)
  }
  visit(app)
  return [...found]
}

const [base, head = "HEAD"] = process.argv.slice(2)
const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
let changed
try {
  // Comparing a commit with itself, as when a run for the commit staging already serves is re-run, tests everything.
  if (git("rev-parse", base).trim() === git("rev-parse", head).trim()) {
    throw new Error("Same commit")
  }
  changed = git("diff", "--name-only", `${base}...${head}`).split("\n").filter(Boolean)
} catch {
  // Without a base to compare against, such as a history too short to hold it, every app counts as affected.
  changed = null
}

const code = changed?.filter((file) => !notCode.some((pattern) => pattern.test(file)))
const everything = !code || code.some((file) => shared.some((pattern) => pattern.test(file)))
const packages = workspace()
const lines = Object.entries(apps).map(([output, app]) => {
  const affected = everything || code.some((file) => folders(app, packages).some((folder) => file.startsWith(folder)))
  return `${output}=${affected}`
})
console.log(
  changed
    ? `${changed.length} files changed since ${base}, ${code.length} of them code`
    : `No comparison with ${base}: every app counts as affected`
)
console.log(lines.join("\n"))
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`)
}
