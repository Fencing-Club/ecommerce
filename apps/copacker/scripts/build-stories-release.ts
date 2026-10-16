import { cp, mkdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { previewResources } from "./preview-config"

const mode = z.enum(["staging", "production", "preview"]).parse(process.argv[2])
let name = mode === "production" ? "copacker-stories" : "copacker-stories-staging"
if (mode === "preview") {
  name = previewResources(process.env.PR_NUMBER || "").stories
}
// A separate project/output tree keeps Storybook deployment independent from the web artifact.
const root = path.resolve(".cloudflare/stories-release")
const output = path.join(root, ".cloudflare/output/v0")
const worker = path.join(output, "workers/default")
const assets = path.resolve(worker, "assets")
if (!assets.startsWith(`${root}${path.sep}`)) {
  throw new Error("Storybook output must remain inside the release workspace")
}
await rm(assets, { recursive: true, force: true })
await mkdir(worker, { recursive: true })
await cp("storybook-static", assets, { recursive: true })
await writeFile(path.join(worker, "assets/health.json"), JSON.stringify({ commit: process.env.APP_COMMIT_SHA || null }))
await writeFile(
  path.join(worker, "assets/_headers"),
  "/*\n  X-Robots-Tag: noindex, nofollow\n  X-Content-Type-Options: nosniff\n/health.json\n  Cache-Control: no-store\n"
)
await writeFile(path.join(output, "config.json"), JSON.stringify({ buildContext: { isPreview: false, mode } }))
await writeFile(
  path.join(worker, "worker.config.json"),
  JSON.stringify({
    name,
    compatibilityDate: "2026-10-15",
    workersDev: mode !== "production",
    previewUrls: false,
    domains: (mode === "preview" ? "" : process.env.CLOUDFLARE_STORIES_DOMAINS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    assets: { notFoundHandling: "single-page-application" },
    observability: { enabled: true, traces: { enabled: true }, redactQueryString: true },
    env: {}
  })
)
process.stdout.write(`Storybook ${mode} artifact prepared in ${root}\n`)
