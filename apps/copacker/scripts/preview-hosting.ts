import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Client } from "pg"
import invariant from "tiny-invariant"
import { z } from "zod"
import { databaseConfig } from "../src/db/connection"
import { storageReferenceQuery } from "../src/db/storage-references"
import { requiredSecrets } from "./cloudflare-environment"
import {
  cloudflare,
  cloudflareJson,
  previewInventory,
  previewObjects,
  provisionHostedPreview,
  type HostingSettings
} from "./preview-cloudflare"
import { previewAssetsHostname, previewResources } from "./preview-config"
import { publishPreviewStories } from "./preview-stories"
import { reconcileResourceTags } from "./resource-tags"

function fingerprint(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex")
}

// Copy the referenced staging documents once. Further pushes preserve the PR's own document edits.
async function copyDocuments(config: HostingSettings, number: string, databaseUrl: URL, folder: string) {
  const prefix = previewResources(number).documentsPrefix
  const marker = `${prefix}.preview-ready`
  const existing = new Set(previewObjects(config, config.bucket, prefix).map((item) => item.key))
  if (existing.has(marker)) {
    return
  }
  const client = new Client(databaseConfig("migration", { ...process.env, DIRECT_DATABASE_URL: databaseUrl.href }))
  await client.connect()
  let keys: string[]
  try {
    keys = z
      .array(z.object({ key: z.string().min(1) }))
      .parse((await client.query(storageReferenceQuery)).rows)
      .map((item) => item.key)
  } finally {
    await client.end()
  }
  const source = new Map(previewObjects(config, config.bucket, "").map((item) => [item.key, item]))
  invariant(
    keys.every((key) => source.has(key)),
    "Referenced staging files are missing from R2; synchronize staging storage before deploying previews"
  )
  const file = path.join(folder, "document")
  for (const key of new Set(keys)) {
    const bytes = Buffer.from(
      cloudflare(config, ["r2", "objects", "get", key, "--bucket-name", config.bucket], { binary: true })
    )
    writeFileSync(file, bytes, { mode: 0o600 })
    cloudflare(config, [
      "r2",
      "objects",
      "put",
      `${prefix}${key}`,
      "--bucket-name",
      config.bucket,
      "--file",
      file,
      "--content-type",
      source.get(key)?.http_metadata?.contentType || "application/octet-stream"
    ])
    const copied = Buffer.from(
      cloudflare(config, ["r2", "objects", "get", `${prefix}${key}`, "--bucket-name", config.bucket], { binary: true })
    )
    invariant(fingerprint(copied) === fingerprint(bytes), "Preview file copy did not match staging")
  }
  cloudflare(config, ["r2", "objects", "put", marker, "--bucket-name", config.bucket, "--body", "ready"])
}

export async function deployHostedPreview(config: HostingSettings, number: string, databaseUrl: URL) {
  const names = previewResources(number)
  const sha = z
    .string()
    .regex(/^[a-f0-9]{40}$/)
    .parse(process.env.APP_COMMIT_SHA)
  const secrets = z.record(z.string(), z.string()).parse(JSON.parse(process.env.CLOUDFLARE_PREVIEW_SECRETS || "{}"))
  const allowed = new Set<string>(requiredSecrets)
  invariant(
    Object.keys(secrets).every((key) => allowed.has(key)),
    "Preview secrets must contain only test authentication and encryption credentials"
  )
  invariant(
    requiredSecrets.every((key) => secrets[key]),
    "Preview authentication/encryption secrets are missing"
  )
  invariant(secrets.WORKOS_COOKIE_PASSWORD.length >= 32, "Preview session password is too short")
  invariant(
    Buffer.from(secrets.TOKEN_ENCRYPTION_KEY, "base64").length === 32,
    "Preview encryption key must encode 32 bytes"
  )
  const folder = mkdtempSync(path.join(tmpdir(), "copacker-preview-"))
  const app = `https://${names.app}.${config.subdomain}.workers.dev`
  const stories = `https://${previewAssetsHostname}/pr-${number}/storybook/`
  try {
    const hyperdrive = provisionHostedPreview(config, number, databaseUrl)
    await copyDocuments(config, number, databaseUrl, folder)
    const secretFile = path.join(folder, "secrets.json")
    writeFileSync(secretFile, JSON.stringify(secrets), { mode: 0o600 })
    const environment = {
      ...process.env,
      ...secrets,
      APP_URL: app,
      APP_COMMIT_SHA: sha,
      CLOUDFLARE_ACCOUNT_ID: config.accountId,
      CLOUDFLARE_DOCUMENTS_BUCKET: config.bucket,
      CLOUDFLARE_HYPERDRIVE_ID: hyperdrive
    }
    const root = fileURLToPath(new URL("..", import.meta.url))
    const run = (args: string[], cwd = root) => {
      try {
        execFileSync(process.execPath, args, {
          cwd,
          env: environment,
          stdio: "pipe",
          timeout: 600000,
          maxBuffer: 32 * 1024 * 1024
        })
      } catch {
        throw new Error("Preview build or deployment failed; no credentials or copied data were logged")
      }
    }
    run([
      fileURLToPath(new URL("./bin/vite.js", import.meta.resolve("vite/package.json"))),
      "build",
      "--mode",
      "preview"
    ])
    run([fileURLToPath(new URL("./dist/bin/dispatcher.js", import.meta.resolve("storybook/package.json"))), "build"])
    const deploy = [
      fileURLToPath(new URL("./bin/cf", import.meta.resolve("cf/package.json"))),
      "deploy",
      "--prebuilt",
      "--mode",
      "preview",
      "--provision=false",
      "--tag",
      sha.slice(0, 12),
      "--message",
      sha
    ]
    run([...deploy, "--dry-run", "--secrets-file", secretFile])
    run([...deploy, "--secrets-file", secretFile])
    const inventory = previewInventory(config)
    const worker = inventory.workers.find((item) => item.name === names.app)
    const queue = inventory.queues.find((item) => item.queue_name === names.queue)
    invariant(worker && queue, "Preview resources missing before tagging")
    const tags = { app: "copacker", environment: "preview", lifecycle: "ephemeral", pr: number }
    const tag = (args: string[], body?: unknown) => cloudflareJson(config, args, body)
    reconcileResourceTags({ type: "worker", id: worker.id, tags: { ...tags, component: "web" } }, tag)
    reconcileResourceTags({ type: "queue", id: queue.queue_id, tags: { ...tags, component: "jobs" } }, tag)
    await publishPreviewStories(config, number, sha, path.join(root, "storybook-static"))
    for (const url of [`${app}/api/health`, `${stories}health.json`]) {
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) })
      invariant(
        response.ok && z.object({ commit: z.string() }).parse(await response.json()).commit === sha,
        "Preview did not serve the tested commit"
      )
    }
    return { app, stories }
  } finally {
    invariant(
      path.dirname(folder) === path.resolve(tmpdir()) && path.basename(folder).startsWith("copacker-preview-"),
      "Invalid preview temporary directory"
    )
    rmSync(folder, { recursive: true, force: true })
  }
}
