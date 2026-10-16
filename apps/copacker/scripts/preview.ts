// Each trusted PR owns one Neon staging child, one Railway web service, and one private document bucket.
import { execFileSync } from "node:child_process"
import { randomBytes } from "node:crypto"
import { appendFileSync } from "node:fs"
import { setTimeout as wait } from "node:timers/promises"
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { z } from "zod"
import { assertPreviewBranch, neonBranch, previewSettings, previewSource } from "./preview-config"

const mode = z.enum(["deploy", "remove", "sweep"]).parse(process.argv[2])
const settings = previewSettings.parse({ ...process.env, ...(mode === "sweep" ? { PR_NUMBER: "1" } : {}) })
const name = `pr-${settings.PR_NUMBER}`
const environment = settings.RAILWAY_PREVIEW_ENVIRONMENT_ID
const project = settings.RAILWAY_PROJECT_ID
if (process.env.RAILWAY_TOKEN) {
  process.env.RAILWAY_TOKEN = process.env.RAILWAY_TOKEN.trim()
}

function log(message: string) {
  process.stdout.write(`${message}\n`)
}

function railway(args: string[], input?: string): string {
  try {
    return execFileSync(process.platform === "win32" ? "railway.exe" : "railway", args, {
      encoding: "utf8",
      input,
      maxBuffer: 8 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"]
    }).trim()
  } catch {
    // CLI errors can contain variable values. Never echo their stdout/stderr into public CI logs.
    throw new Error(`Railway ${args[0]} failed; inspect the service in the Railway dashboard`)
  }
}

function json(args: string[]): unknown {
  return JSON.parse(railway([...args, "--json"]))
}

function api(query: string, variables: Record<string, unknown>) {
  const result = z
    .object({ data: z.unknown().optional(), errors: z.array(z.unknown()).optional() })
    .parse(JSON.parse(railway(["api", query, "--variables", "@-", "--compact"], JSON.stringify(variables))))
  if (result.errors?.length) {
    throw new Error("Railway API rejected the preview configuration")
  }
  return result.data
}

async function neon(path: string, method = "GET", body?: unknown) {
  const key = z.string().min(1).parse(process.env.NEON_API_KEY)
  const response = await fetch(`https://console.neon.tech/api/v2/projects/${settings.NEON_PROJECT_ID}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(60000)
  })
  if (!response.ok) {
    throw new Error(`Neon ${method} failed (${response.status})`)
  }
  return response.json()
}

async function findBranch(branchName = name) {
  let cursor: string | undefined
  do {
    const query = new URLSearchParams({ search: branchName, limit: "100", ...(cursor ? { cursor } : {}) })
    const result = z
      .object({
        branches: z.array(neonBranch),
        pagination: z.object({ next: z.string().nullable().optional() }).optional()
      })
      .parse(await neon(`/branches?${query}`))
    const branch = result.branches.find((entry) => entry.name === branchName)
    if (branch) {
      assertPreviewBranch(branch, branchName, settings.NEON_STAGING_BRANCH_ID)
      return branch
    }
    cursor = result.pagination?.next ?? undefined
  } while (cursor)
}

// Verify the target by its immutable ID and human-readable name before any provisioning or removal.
const target = z
  .object({ environment: z.object({ name: z.literal("previews"), projectId: z.literal(project) }) })
  .parse(api("query($id:String!){environment(id:$id){name projectId}}", { id: environment }))
log(`Preparing ${name} in ${target.environment.name}`)
// Environment-scoped CI tokens already select their project. `link` requires a user login.
if (!process.env.RAILWAY_TOKEN) {
  railway(["link", "--project", project, "--environment", environment, "--json"])
}
const resources = z.array(z.object({ id: z.string(), name: z.string() }))
const services = resources.parse(json(["service", "list"]))
const buckets = resources.parse(json(["bucket", "list", "--environment", environment]))
if (mode === "sweep") {
  const repository = z
    .string()
    .regex(/^[\w.-]+\/[\w.-]+$/)
    .parse(process.env.GITHUB_REPOSITORY)
  const token = z.string().min(1).parse(process.env.GH_TOKEN)
  for (const candidate of new Set(
    [...services, ...buckets].map((entry) => entry.name).filter((entry) => /^pr-[1-9]\d*$/.test(entry))
  )) {
    const number = candidate.slice(3)
    const response = await fetch(`https://api.github.com/repos/${repository}/pulls/${number}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(30000)
    })
    if (!response.ok && response.status !== 404) {
      throw new Error(`GitHub PR lookup failed (${response.status})`)
    }
    const isClosed =
      response.status === 404 ||
      z.object({ state: z.enum(["open", "closed"]) }).parse(await response.json()).state === "closed"
    if (isClosed || !(await findBranch(candidate))) {
      execFileSync(process.execPath, ["--import", "tsx", import.meta.filename, "remove"], {
        env: { ...process.env, PR_NUMBER: number },
        stdio: "inherit"
      })
    }
  }
  process.exit(0)
}
let service = services.find((entry) => entry.name === name)
let bucket = buckets.find((entry) => entry.name === name)
let branch = await findBranch()

if (mode === "remove") {
  // Stop the app before deleting its persistence. Reruns tolerate already-removed resources.
  if (service) {
    railway(["service", "delete", "--service", service.id, "--environment", environment, "--yes"])
  }
  if (bucket) {
    railway(["bucket", "delete", "--bucket", bucket.id, "--environment", environment, "--yes"])
  }
  if (branch) {
    await neon(`/branches/${branch.id}`, "DELETE")
  }
  log(`Removed ${name}`)
} else {
  const sha = z
    .string()
    .regex(/^[a-f0-9]{40}$/)
    .parse(process.env.PREVIEW_COMMIT_SHA)
  const source = previewSource.parse(JSON.parse(process.env.COPACKER_PREVIEW_CONFIG ?? "{}"))
  // An expired database must never be paired with a surviving app or an older document bucket.
  if (!branch) {
    if (service) {
      railway(["service", "delete", "--service", service.id, "--environment", environment, "--yes"])
    }
    if (bucket) {
      railway(["bucket", "delete", "--bucket", bucket.id, "--environment", environment, "--yes"])
    }
    service = undefined
    bucket = undefined
  }
  const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString().replace(/\.\d{3}Z$/, "Z")
  if (!branch) {
    branch = z.object({ branch: neonBranch }).parse(
      await neon("/branches", "POST", {
        branch: { name, parent_id: settings.NEON_STAGING_BRANCH_ID, expires_at: expiresAt },
        endpoints: [
          {
            type: "read_write",
            autoscaling_limit_min_cu: 0.25,
            autoscaling_limit_max_cu: 1,
            suspend_timeout_seconds: 300
          }
        ]
      })
    ).branch
    assertPreviewBranch(branch, name, settings.NEON_STAGING_BRANCH_ID)
  } else {
    await neon(`/branches/${branch.id}`, "PATCH", { branch: { expires_at: expiresAt } })
  }
  log(`Using Neon branch ${branch.id}`)
  const branchId = branch.id
  const connection = async (pooled: boolean) => {
    const params = new URLSearchParams({
      branch_id: branchId,
      database_name: settings.NEON_DATABASE_NAME,
      role_name: settings.NEON_ROLE_NAME,
      pooled: String(pooled)
    })
    const result = z.object({ uri: z.string() }).parse(await neon(`/connection_uri?${params}`))
    const url = new URL(result.uri)
    url.searchParams.set("sslmode", "verify-full")
    return url.toString()
  }
  const direct = await connection(false)
  const pooled = await connection(true)
  if (!service) {
    service = z.object({ id: z.string(), name: z.string() }).parse(json(["add", "--service", name]))
  }
  if (!bucket) {
    bucket = z
      .object({ id: z.string(), name: z.string() })
      .parse(json(["bucket", "create", name, "--region", "sjc", "--environment", environment]))
  }
  const existing = z
    .record(z.string(), z.string())
    .parse(json(["variable", "list", "--service", service.id, "--environment", environment]))
  const credentials = z
    .object({ accessKeyId: z.string(), secretAccessKey: z.string(), bucketName: z.string(), endpoint: z.string() })
    .parse(json(["bucket", "credentials", "--bucket", bucket.id, "--environment", environment]))
  if (existing.PREVIEW_DOCUMENTS_READY !== bucket.id) {
    const origin = new S3Client({
      endpoint: source.S3_ENDPOINT,
      region: "auto",
      forcePathStyle: true,
      credentials: { accessKeyId: source.S3_ACCESS_KEY_ID, secretAccessKey: source.S3_SECRET_ACCESS_KEY }
    })
    const destination = new S3Client({
      endpoint: credentials.endpoint,
      region: "auto",
      forcePathStyle: true,
      credentials
    })
    let continuation: string | undefined
    let count = 0
    do {
      const page = await origin.send(
        new ListObjectsV2Command({ Bucket: source.S3_BUCKET, ContinuationToken: continuation })
      )
      for (const object of page.Contents ?? []) {
        if (!object.Key) {
          continue
        }
        const file = await origin.send(new GetObjectCommand({ Bucket: source.S3_BUCKET, Key: object.Key }))
        if (!file.Body) {
          throw new Error("A staging document could not be read")
        }
        await destination.send(
          new PutObjectCommand({
            Bucket: credentials.bucketName,
            Key: object.Key,
            Body: await file.Body.transformToByteArray(),
            ContentType: file.ContentType
          })
        )
        count++
      }
      continuation = page.NextContinuationToken
    } while (continuation)
    log(`Copied ${count} staging documents to the preview's private bucket`)
  }
  const domains = z
    .object({ domains: z.array(z.object({ domain: z.string(), type: z.string() })) })
    .parse(json(["domain", "list", "--service", service.id, "--environment", environment]))
  const existingDomain = domains.domains.find((entry) => entry.type === "service")
  const url = existingDomain
    ? `https://${existingDomain.domain}`
    : z
        .object({ domain: z.url() })
        .parse(json(["domain", "--service", service.id, "--environment", environment, "--port", "3000"])).domain
  api("mutation($input:VariableCollectionUpsertInput!){variableCollectionUpsert(input:$input)}", {
    input: {
      projectId: project,
      environmentId: environment,
      serviceId: service.id,
      skipDeploys: true,
      variables: {
        DATABASE_URL: pooled,
        DIRECT_DATABASE_URL: direct,
        WORKOS_API_KEY: source.WORKOS_API_KEY,
        WORKOS_CLIENT_ID: source.WORKOS_CLIENT_ID,
        TOKEN_ENCRYPTION_KEY: source.TOKEN_ENCRYPTION_KEY,
        WORKOS_COOKIE_PASSWORD: existing.WORKOS_COOKIE_PASSWORD || randomBytes(32).toString("base64"),
        APP_URL: url,
        NEXT_PUBLIC_WORKOS_REDIRECT_URI: `${url}/callback`,
        APP_COMMIT_SHA: sha,
        S3_ENDPOINT: credentials.endpoint,
        S3_BUCKET: credentials.bucketName,
        S3_ACCESS_KEY_ID: credentials.accessKeyId,
        S3_SECRET_ACCESS_KEY: credentials.secretAccessKey,
        PREVIEW_DOCUMENTS_READY: bucket.id,
        PORT: "3000",
        NODE_ENV: "production",
        AMAZON_SELF_AUTH_ENABLED: "false"
      }
    }
  })
  api(
    "mutation($serviceId:String!,$environmentId:String!,$input:ServiceInstanceUpdateInput!){serviceInstanceUpdate(serviceId:$serviceId,environmentId:$environmentId,input:$input)}",
    {
      serviceId: service.id,
      environmentId: environment,
      input: {
        builder: "DOCKERFILE",
        dockerfilePath: "Dockerfile",
        preDeployCommand: ["pnpm --filter copacker predeploy"],
        healthcheckPath: "/api/health",
        healthcheckTimeout: 120
      }
    }
  )
  // Upload the monorepo, not apps/copacker (the package script's working directory).
  railway([
    "up",
    "../..",
    "--path-as-root",
    "--service",
    service.id,
    "--environment",
    environment,
    "--detach",
    "--message",
    sha
  ])
  let isHealthy = false
  for (let attempt = 0; attempt < 180; attempt++) {
    const deployments = z
      .array(z.object({ status: z.string() }))
      .parse(json(["deployment", "list", "--service", service.id, "--environment", environment, "--limit", "1"]))
    if (["FAILED", "CRASHED", "REMOVED"].includes(deployments[0]?.status ?? "")) {
      throw new Error("Preview deployment failed")
    }
    try {
      const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(10000) })
      const health = z.object({ commit: z.string().nullable() }).parse(await response.json())
      if (response.ok && health.commit === sha && deployments[0]?.status === "SUCCESS") {
        isHealthy = true
        break
      }
    } catch {
      /* The service may still be building or starting. */
    }
    await wait(10000)
  }
  if (!isHealthy) {
    throw new Error("Preview did not become healthy within 30 minutes")
  }
  log(`Preview ready: ${url}`)
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `url=${url}\nbranch_id=${branch.id}\n`)
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `Preview: ${url}\n\nNeon branch: ${name}\n\nBased on staging, with an isolated database and document bucket. Background workers, outgoing email, and commerce credentials are disabled.\n`
    )
  }
}
