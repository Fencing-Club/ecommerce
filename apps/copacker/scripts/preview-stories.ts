import { cpSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"
import invariant from "tiny-invariant"
import { cloudflare, type HostingSettings } from "./preview-cloudflare"
import { previewResources } from "./preview-config"
import type { PreviewTimings } from "./preview-timings"

// Assets-only Worker: no app credentials, database connection or private bucket binding.
// cf batches missing content hashes and publishes the complete asset manifest atomically.
export function publishPreviewStories(
  config: HostingSettings,
  number: string,
  commit: string,
  directory: string,
  timings?: PreviewTimings
) {
  invariant(/^[a-f0-9]{40}$/.test(commit), "Invalid Storybook commit")
  const name = previewResources(number).stories
  const entries = readdirSync(directory, { recursive: true, withFileTypes: true })
  invariant(
    entries.every((entry) => !entry.isSymbolicLink()),
    "Storybook build must not contain symbolic links"
  )
  const files = entries.filter((entry) => entry.isFile()).map((entry) => path.join(entry.parentPath, entry.name))
  invariant(files.includes(path.join(directory, "index.html")), "Storybook build is missing index.html")
  timings?.count({
    storybookFiles: files.length,
    storybookBytes: files.reduce((sum, file) => sum + statSync(file).size, 0)
  })
  const project = path.resolve(directory, "../.cloudflare/preview-stories")
  const output = path.join(project, ".cloudflare/output/v0")
  const worker = path.join(output, "workers/default")
  const assets = path.resolve(worker, "assets")
  invariant(assets.startsWith(`${project}${path.sep}`), "Storybook assets escaped the preview workspace")
  rmSync(assets, { recursive: true, force: true })
  mkdirSync(worker, { recursive: true })
  cpSync(directory, assets, { recursive: true })
  writeFileSync(path.join(assets, "health.json"), JSON.stringify({ commit }))
  writeFileSync(
    path.join(assets, "_headers"),
    "/*\n  X-Robots-Tag: noindex, nofollow\n  X-Content-Type-Options: nosniff\n/health.json\n  Cache-Control: no-store\n"
  )
  writeFileSync(
    path.join(output, "config.json"),
    JSON.stringify({ buildContext: { isPreview: false, mode: "preview" } })
  )
  writeFileSync(
    path.join(worker, "worker.config.json"),
    JSON.stringify({
      name,
      compatibilityDate: "2026-10-17",
      workersDev: true,
      previewUrls: false,
      assets: { notFoundHandling: "none" },
      observability: { enabled: true, traces: { enabled: true }, redactQueryString: true },
      env: {}
    })
  )
  const args = [
    "deploy",
    "--prebuilt",
    "--mode",
    "preview",
    "--provision=false",
    "--tag",
    commit.slice(0, 12),
    "--message",
    commit
  ]
  cloudflare(config, [...args, "--dry-run"], { cwd: project, timeoutMs: 600000 })
  cloudflare(config, args, { cwd: project, timeoutMs: 600000 })
}
