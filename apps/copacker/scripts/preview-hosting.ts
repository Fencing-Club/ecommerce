import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import invariant from "tiny-invariant"
import { z } from "zod"
import { requiredSecrets } from "./cloudflare-environment"
import { cloudflareJson, previewInventory, provisionHostedPreview, type HostingSettings } from "./preview-cloudflare"
import { previewResources } from "./preview-config"
import { copyPreviewDocuments } from "./preview-documents"
import { publishPreviewStories } from "./preview-stories"
import { PreviewTimings } from "./preview-timings"
import { verifyReleaseHealth } from "./release-health"
import { reconcileResourceTags } from "./resource-tags"
import { verifyStorybookArtifact } from "./storybook-artifact"

export async function deployHostedPreview(
  config: HostingSettings,
  number: string,
  databaseUrl: URL,
  timings = new PreviewTimings()
) {
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
  const stories = `https://${names.stories}.${config.subdomain}.workers.dev/`
  const root = fileURLToPath(new URL("..", import.meta.url))
  try {
    await timings.measure("storybook-artifact", () => verifyStorybookArtifact(path.join(root, "storybook-static"), sha))
    const hyperdrive = await timings.measure("resources", () => provisionHostedPreview(config, number, databaseUrl))
    await timings.measure("documents", () => copyPreviewDocuments(config, number, databaseUrl, folder, timings))
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
    const run = (args: string[], cwd = root) => {
      try {
        return execFileSync(process.execPath, args, {
          cwd,
          env: environment,
          stdio: "pipe",
          timeout: 600000,
          maxBuffer: 32 * 1024 * 1024
        }).toString()
      } catch {
        throw new Error("Preview build or deployment failed; no credentials or copied data were logged")
      }
    }
    await timings.measure("app-build", () => {
      const output = run([
        fileURLToPath(new URL("../../../node_modules/turbo/bin/turbo", import.meta.url)),
        "run",
        "build:preview",
        "--filter=copacker",
        "--log-order=stream",
        "--log-prefix=task",
        "--output-logs=hash-only"
      ])
      timings.buildCache(output)
    })
    await timings.measure("worker-regression", () => run(["--import", "tsx", "scripts/test-worker-webhooks.ts"]))
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
    await timings.measure("app-validate", () => run([...deploy, "--dry-run", "--secrets-file", secretFile]))
    await timings.measure("app-deploy", () => run([...deploy, "--secrets-file", secretFile]))
    await timings.measure("storybook-publish", () =>
      publishPreviewStories(config, number, sha, path.join(root, "storybook-static"), timings)
    )
    await timings.measure("resource-tags", () => {
      const inventory = previewInventory(config, number, false)
      const worker = inventory.workers.find((item) => item.name === names.app)
      const storyWorker = inventory.workers.find((item) => item.name === names.stories)
      const queue = inventory.queues.find((item) => item.queue_name === names.queue)
      invariant(worker && storyWorker && queue, "Preview resources missing before tagging")
      const tags = { app: "copacker", environment: "preview", lifecycle: "ephemeral", pr: number }
      const tag = (args: string[], body?: unknown) => cloudflareJson(config, args, body)
      reconcileResourceTags({ type: "worker", id: worker.id, tags: { ...tags, component: "web" } }, tag)
      reconcileResourceTags({ type: "worker", id: storyWorker.id, tags: { ...tags, component: "storybook" } }, tag)
      reconcileResourceTags({ type: "queue", id: queue.queue_id, tags: { ...tags, component: "jobs" } }, tag)
    })
    for (const [phase, url] of [
      ["app-health", `${app}/api/health`],
      ["storybook-health", `${stories}health.json`]
    ] as const) {
      await timings.measure(phase, () => verifyReleaseHealth(new URL(url), sha))
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
