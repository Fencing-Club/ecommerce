import { randomUUID } from "node:crypto"
import { readdirSync, statSync } from "node:fs"
import path from "node:path"
import invariant from "tiny-invariant"
import { cloudflare, previewObjects, uploadPreviewFile, type HostingSettings } from "./preview-cloudflare"
import { previewResources } from "./preview-config"
import type { PreviewTimings } from "./preview-timings"

const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".wasm": "application/wasm",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".webmanifest": "application/manifest+json"
}

export async function publishPreviewStories(
  config: HostingSettings,
  number: string,
  commit: string,
  directory: string,
  timings?: PreviewTimings
) {
  invariant(/^[a-f0-9]{40}$/.test(commit), "Invalid Storybook commit")
  const { storiesPrefix } = previewResources(number)
  const version = randomUUID()
  const prefix = `${storiesPrefix}${version}/`
  const files = readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const file = path.join(entry.parentPath, entry.name)
      const relative = path.relative(directory, file).replaceAll("\\", "/")
      invariant(!relative.startsWith("../") && !path.isAbsolute(relative), "Storybook file escaped its build directory")
      return { file, relative }
    })
  invariant(
    files.some((file) => file.relative === "index.html"),
    "Storybook build is missing index.html"
  )
  timings?.count({
    storybookFiles: files.length,
    storybookBytes: files.reduce((total, item) => total + statSync(item.file).size, 0)
  })
  // Finish each bounded batch even on failure. Never publish a partially uploaded build.
  for (let offset = 0; offset < files.length; offset += 8) {
    const results = await Promise.allSettled(
      files
        .slice(offset, offset + 8)
        .map(({ file, relative }) =>
          uploadPreviewFile(
            config,
            `${prefix}${relative}`,
            file,
            contentTypes[path.extname(relative)] || "application/octet-stream"
          )
        )
    )
    invariant(
      results.every((result) => result.status === "fulfilled"),
      "Storybook upload incomplete; retry the preview workflow"
    )
  }
  const marker = `${storiesPrefix}.release.json`
  cloudflare(config, [
    "r2",
    "objects",
    "put",
    marker,
    "--bucket-name",
    config.bucket,
    "--content-type",
    "application/json",
    "--body",
    JSON.stringify({ commit, version })
  ])
  // The marker switches readers atomically. Superseded and interrupted builds are now safe to remove.
  const obsolete = previewObjects(config, config.bucket, storiesPrefix).filter(
    (item) => item.key !== marker && !item.key.startsWith(prefix)
  )
  for (let offset = 0; offset < obsolete.length; offset += 1000) {
    cloudflare(config, ["r2", "objects", "bulk-delete", "--bucket-name", config.bucket, "--force"], {
      body: obsolete.slice(offset, offset + 1000).map((item) => item.key)
    })
  }
}
