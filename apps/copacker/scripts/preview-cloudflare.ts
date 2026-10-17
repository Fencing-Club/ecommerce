import { execFile, execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, rmdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import invariant from "tiny-invariant"
import { z } from "zod"
import { previewNumber, previewResources } from "./preview-config"

export const hostingSettings = z.object({
  accountId: z.string().regex(/^[a-f0-9]{32}$/),
  bucket: z.literal("copacker-staging-private"),
  subdomain: z.string().regex(/^[a-z0-9-]+$/),
  caCertificateId: z.string().uuid()
})
export type HostingSettings = z.infer<typeof hostingSettings>
const worker = z.object({ id: z.string(), name: z.string() })
const hyperdrive = z.object({ id: z.string(), name: z.string() })
const queue = z.object({ queue_id: z.string(), queue_name: z.string() })
const object = z.object({
  key: z.string(),
  size: z.number().optional(),
  http_metadata: z.object({ contentType: z.string().optional() }).optional()
})
const cli = fileURLToPath(new URL("./bin/cf", import.meta.resolve("cf/package.json")))

// Async child processes allow bounded document concurrency without logging provider output.
export async function cloudflareAsync(config: HostingSettings, args: string[], binary = false) {
  try {
    const result = await promisify(execFile)(process.execPath, [cli, ...args], {
      env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: config.accountId },
      timeout: 120000,
      maxBuffer: 64 * 1024 * 1024,
      encoding: binary ? "buffer" : "utf8"
    })
    return result.stdout
  } catch {
    throw new Error(`Cloudflare ${args.slice(0, 2).join(" ")} failed; retry the preview workflow`)
  }
}

// Keep cf's output private: Hyperdrive responses and CLI errors can contain database credentials.
export function cloudflare(
  config: Pick<HostingSettings, "accountId">,
  args: string[],
  options: { body?: unknown; binary?: boolean; cwd?: string; timeoutMs?: number } = {}
) {
  const directory = options.body === undefined ? undefined : mkdtempSync(path.join(tmpdir(), "copacker-cf-body-"))
  try {
    if (directory) {
      // Avoid leaking Hyperdrive passwords in process arguments and Windows' command-line size limit on bulk deletes.
      const file = path.join(directory, "body.json")
      writeFileSync(file, JSON.stringify(options.body), { mode: 0o600 })
      args = [...args, "--body", `@${file}`]
    }
    return execFileSync(process.execPath, [cli, ...args], {
      cwd: options.cwd,
      env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: config.accountId },
      stdio: "pipe",
      timeout: options.timeoutMs ?? 120000,
      maxBuffer: 64 * 1024 * 1024,
      ...(options.binary ? {} : { encoding: "utf8" })
    })
  } catch {
    throw new Error(`Cloudflare ${args.slice(0, 2).join(" ")} failed; retry the preview workflow`)
  } finally {
    if (directory) {
      rmSync(path.join(directory, "body.json"), { force: true })
      rmdirSync(directory)
    }
  }
}

export function cloudflareJson(config: Pick<HostingSettings, "accountId">, args: string[], body?: unknown): unknown {
  return JSON.parse(cloudflare(config, args, { body }).toString())
}

function pages<T>(config: HostingSettings, args: string[], schema: z.ZodType<T>) {
  const values: T[] = []
  for (let page = 1; ; page++) {
    const batch = z.array(schema).parse(cloudflareJson(config, [...args, "--per-page", "100", "--page", String(page)]))
    if (!batch.length) {
      return values
    }
    values.push(...batch)
  }
}

// cf returns the object array without the API cursor. Lexicographic start-after also handles short pages.
export function previewObjects(config: HostingSettings, bucket: string, prefix: string) {
  const values: z.infer<typeof object>[] = []
  let after = ""
  for (;;) {
    const batch = z
      .array(object)
      .parse(
        cloudflareJson(config, [
          "r2",
          "objects",
          "list",
          "--bucket-name",
          bucket,
          "--prefix",
          prefix,
          "--per-page",
          "1000",
          ...(after ? ["--start-after", after] : [])
        ])
      )
    if (!batch.length) {
      return values
    }
    for (const entry of batch) {
      invariant(entry.key.startsWith(prefix) && entry.key > after, "R2 listing escaped its prefix or did not advance")
      values.push(entry)
    }
    after = batch.at(-1)!.key
  }
}

export function previewInventory(config: HostingSettings) {
  return {
    workers: pages(config, ["workers", "list"], worker),
    hyperdrives: pages(config, ["hyperdrive", "list"], hyperdrive),
    queues: z.array(queue).parse(cloudflareJson(config, ["queues", "list"])),
    objects: previewObjects(config, config.bucket, "previews/pr-")
  }
}
type Inventory = ReturnType<typeof previewInventory>

export function hostedPreviewNumbers(inventory: Inventory) {
  const numbers = new Set<string>()
  for (const name of [
    ...inventory.workers.map((item) => item.name),
    ...inventory.hyperdrives.map((item) => item.name),
    ...inventory.queues.map((item) => item.queue_name),
    ...inventory.objects.map((item) => item.key)
  ]) {
    const match = /^(?:copacker-(?:(?:jobs|stories)-)?pr-([1-9]\d*)|previews\/pr-([1-9]\d*)\/.*)$/.exec(name)
    const number = match?.[1] || match?.[2]
    if (number) {
      numbers.add(number)
    }
  }
  return numbers
}

export function removeHostedPreview(config: HostingSettings, input: string) {
  const number = previewNumber.parse(input)
  const names = previewResources(number)
  const inventory = previewInventory(config)
  // Stop all writers first. If this fails, preserve files/database rather than race a live preview.
  const ownedWorkers = new Set([names.app, names.stories])
  for (const item of inventory.workers.filter((entry) => ownedWorkers.has(entry.name))) {
    cloudflare(config, ["workers", "delete", item.id, "--force"])
  }
  const remaining = pages(config, ["workers", "list"], worker)
  invariant(!remaining.some((item) => ownedWorkers.has(item.name)), "Preview Worker still exists after deletion")
  const failures: string[] = []
  function attempt(label: string, remove: () => void) {
    try {
      remove()
    } catch {
      failures.push(label)
    }
  }
  for (const item of inventory.queues.filter((entry) => entry.queue_name === names.queue)) {
    attempt("queue", () => cloudflare(config, ["queues", "delete", item.queue_id, "--force"]))
  }
  for (const item of inventory.hyperdrives.filter((entry) => entry.name === names.app)) {
    attempt("Hyperdrive", () => cloudflare(config, ["hyperdrive", "delete", item.id, "--force"]))
  }
  const objects = inventory.objects.filter((item) => item.key.startsWith(names.prefix))
  for (let offset = 0; offset < objects.length; offset += 1000) {
    attempt("files", () =>
      cloudflare(config, ["r2", "objects", "bulk-delete", "--bucket-name", config.bucket, "--force"], {
        body: objects.slice(offset, offset + 1000).map((item) => item.key)
      })
    )
  }
  invariant(!failures.length, `Preview cleanup incomplete (${[...new Set(failures)].join(", ")}); rerun cleanup`)
  invariant(
    !hostedPreviewNumbers(previewInventory(config)).has(number),
    "Preview resources remain after cleanup; rerun cleanup"
  )
}

export function provisionHostedPreview(config: HostingSettings, number: string, databaseUrl: URL) {
  const names = previewResources(number)
  const inventory = previewInventory(config)
  const body = {
    name: names.app,
    origin: {
      scheme: "postgresql",
      host: databaseUrl.hostname,
      port: Number(databaseUrl.port || "5432"),
      database: decodeURIComponent(databaseUrl.pathname.slice(1)),
      user: decodeURIComponent(databaseUrl.username),
      password: decodeURIComponent(databaseUrl.password)
    },
    caching: { disabled: true },
    origin_connection_limit: 5,
    mtls: { sslmode: "verify-full", ca_certificate_id: config.caCertificateId }
  }
  const existing = inventory.hyperdrives.filter((item) => item.name === names.app)
  invariant(existing.length <= 1, "Duplicate preview Hyperdrive configurations require cleanup")
  const result = hyperdrive.parse(
    cloudflareJson(config, existing[0] ? ["hyperdrive", "replace", existing[0].id] : ["hyperdrive", "create"], body)
  )
  if (!inventory.queues.some((item) => item.queue_name === names.queue)) {
    cloudflare(config, ["queues", "create", "--queue-name", names.queue])
  }
  return result.id
}
