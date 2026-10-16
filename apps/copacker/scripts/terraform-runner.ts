import { execFileSync, spawnSync } from "node:child_process"
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import invariant from "tiny-invariant"
import { z } from "zod"
import {
  backupState,
  planPrefix,
  planRecord,
  planSummary,
  sha256,
  terraformEnvironment,
  validateApprovedPlan,
  writeVerified
} from "./terraform-operation"

const account = "544b5bfd594cd02a5da4b79a2038cc9f"
const endpoint = `https://${account}.r2.cloudflarestorage.com`
const bucket = "copacker-terraform-state"
const app = fileURLToPath(new URL("..", import.meta.url))
const directory = path.join(app, ".cloudflare/terraform-operation")
mkdirSync(directory, { recursive: true })
const logFile = path.join(directory, "terraform.log")
writeFileSync(logFile, "", { mode: 0o600 })
let stage = "configuration"

async function main() {
  const operation = z.enum(["plan", "apply", "backup"]).parse(process.argv[2])
  const environment = terraformEnvironment.parse(process.env.TF_ENVIRONMENT)
  const credentials = z
    .object({
      S3_ENDPOINT: z.literal(endpoint),
      S3_BUCKET: z.literal(bucket),
      S3_ACCESS_KEY_ID: z.string().min(1),
      S3_SECRET_ACCESS_KEY: z.string().min(1)
    })
    .parse(JSON.parse(process.env.TF_STATE_CREDENTIALS || "{}"))
  const id = z
    .string()
    .regex(/^[1-9]\d*$/)
    .parse(process.env.GITHUB_RUN_ID)
  const attempt = z
    .string()
    .regex(/^[1-9]\d*$/)
    .parse(process.env.GITHUB_RUN_ATTEMPT)
  const commit = z
    .string()
    .regex(/^[a-f0-9]{40}$/)
    .parse(process.env.GITHUB_SHA)
  invariant(process.env.GITHUB_REF === "refs/heads/main", "Infrastructure operations run only from main")
  invariant(
    execFileSync("git", ["rev-parse", "HEAD"], { cwd: app, encoding: "utf8" }).trim() === commit,
    "Infrastructure commit differs from the checked-out source"
  )
  if (operation === "apply") {
    invariant(process.env.GITHUB_EVENT_NAME === "workflow_dispatch", "Applies require an explicit manual dispatch")
  }
  const client = new S3Client({
    endpoint,
    region: "auto",
    forcePathStyle: true,
    credentials: { accessKeyId: credentials.S3_ACCESS_KEY_ID, secretAccessKey: credentials.S3_SECRET_ACCESS_KEY }
  })
  const store = {
    async read(key: string) {
      const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
      invariant(response.Body, "Private object has no body")
      return Buffer.from(await response.Body.transformToByteArray())
    },
    async write(key: string, bytes: Buffer) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, IfNoneMatch: "*" }))
    }
  }
  const childEnvironment = {
    ...process.env,
    TF_IN_AUTOMATION: "true",
    TF_LOG: "",
    AWS_ACCESS_KEY_ID: credentials.S3_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: credentials.S3_SECRET_ACCESS_KEY
  }
  function terraform(args: string[], allowed = [0]) {
    const result = spawnSync(process.env.TERRAFORM_BINARY || "terraform", args, {
      cwd: path.join(app, "infra", environment),
      env: childEnvironment,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      timeout: 20 * 60 * 1000
    })
    appendFileSync(logFile, `${args[0]}\n${result.stdout || ""}\n${result.stderr || ""}\n`)
    invariant(result.status !== null && allowed.includes(result.status), "Terraform command failed")
    return result.stdout
  }
  const summary = (message: string) => {
    process.stdout.write(`${message}\n`)
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n\n`)
    }
  }
  async function backup() {
    const snapshot = await backupState(store, environment, (bytes) => {
      const file = path.join(directory, "restore-check.tfstate")
      writeFileSync(file, bytes, { mode: 0o600 })
      const restored: unknown = JSON.parse(terraform(["show", "-json", file]))
      z.object({ format_version: z.string(), values: z.object({ root_module: z.object({}) }) }).parse(restored)
    })
    summary(
      `Verified ${environment} state backup and isolated restore read: ${snapshot.key} (SHA-256 ${snapshot.sha256}).`
    )
    return snapshot
  }
  try {
    stage = "backend initialization"
    terraform([
      "init",
      "-input=false",
      "-lockfile=readonly",
      `-backend-config=bucket=${bucket}`,
      `-backend-config=endpoints={s3="${endpoint}"}`
    ])
    stage = "state backup and recovery verification"
    await backup()
    if (operation === "backup") {
      return
    }
    const planFile = path.join(directory, "change.tfplan")
    if (operation === "plan") {
      stage = "planning"
      terraform(["plan", "-input=false", "-lock-timeout=5m", "-detailed-exitcode", `-out=${planFile}`], [0, 2])
      const bytes = readFileSync(planFile)
      const record = planRecord.parse({
        environment,
        commit,
        runId: id,
        attempt,
        createdAt: new Date().toISOString(),
        sha256: sha256(bytes),
        stateSha256: sha256(await store.read(`copacker/${environment}/terraform.tfstate`))
      })
      const prefix = planPrefix(environment, id, attempt)
      await writeVerified(store, `${prefix}/change.tfplan`, bytes)
      await writeVerified(store, `${prefix}/review.txt`, Buffer.from(terraform(["show", "-no-color", planFile])))
      await writeVerified(store, `${prefix}/record.json`, Buffer.from(JSON.stringify(record)))
      const changes = planSummary(JSON.parse(terraform(["show", "-json", planFile])))
      summary(`Plan for ${environment} at ${commit}. Private review: ${prefix}/review.txt.`)
      summary(
        `Apply inputs: plan_run_id=${id}, plan_attempt=${attempt}, plan_sha256=${record.sha256}. Expires in two hours.`
      )
      summary(`Resource actions:\n\n\x60\x60\x60json\n${JSON.stringify(changes, null, 2)}\n\x60\x60\x60`)
      return
    }
    stage = "approval and saved-plan validation"
    const approved = {
      environment,
      commit,
      runId: process.env.TF_PLAN_RUN_ID || "",
      attempt: process.env.TF_PLAN_ATTEMPT || "",
      sha256: process.env.TF_PLAN_SHA256 || ""
    }
    const prefix = planPrefix(environment, approved.runId, approved.attempt)
    const record = planRecord.parse(JSON.parse((await store.read(`${prefix}/record.json`)).toString("utf8")))
    const bytes = await store.read(`${prefix}/change.tfplan`)
    validateApprovedPlan(record, bytes, await store.read(`copacker/${environment}/terraform.tfstate`), approved)
    writeFileSync(planFile, bytes, { mode: 0o600 })
    stage = "applying the approved plan"
    try {
      terraform(["apply", "-input=false", "-lock-timeout=5m", planFile])
    } finally {
      // Terraform can persist useful partial progress even when an apply fails.
      await backup()
    }
    summary(`Applied the approved ${environment} plan ${record.sha256} from ${record.commit}.`)
  } catch (error) {
    appendFileSync(
      logFile,
      `Operation failed during ${stage}: ${error instanceof Error ? error.message : "unknown error"}\n`
    )
    throw error
  } finally {
    // Provider diagnostics may contain sensitive values. Never print them or upload Actions artifacts.
    await writeVerified(store, `operations/${environment}/${id}/${attempt}/terraform.log`, readFileSync(logFile))
    client.destroy()
  }
}

try {
  await main()
} catch {
  process.stderr.write(
    `Terraform operation failed during ${stage}. Review the private R2 operation log; no provider diagnostics were printed.\n`
  )
  process.exitCode = 1
}
