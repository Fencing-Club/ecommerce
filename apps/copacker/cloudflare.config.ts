import { fileURLToPath } from "node:url"
import { bindings, defineConfig, exports, triggers } from "cf/config"
import { z } from "zod"
import { optionalSecrets, workerSettings } from "./scripts/cloudflare-environment.ts"
import { localStorage } from "./scripts/local-storage.ts"
import { previewResources } from "./scripts/preview-config.ts"

export default defineConfig(({ mode }) => {
  const preview = mode === "preview" ? previewResources(process.env.PR_NUMBER || "") : undefined
  const deployed = mode === "staging" || mode === "production" || Boolean(preview)
  const production = mode === "production"
  const executor = mode === "staging" || mode === "production"
  const executorQueue = `copacker-executor-${production ? "production" : "staging"}`
  const environment = deployed ? z.enum(["preview", "production", "staging"]).parse(mode) : "local"
  const defaults = {
    preview: { name: preview?.app || "", origin: "" },
    local: { name: "copacker-local", origin: "https://local.copacker.ai" },
    staging: { name: "copacker-staging", origin: "https://copacker-staging.hoa-preview.workers.dev" },
    production: { name: "copacker", origin: "https://copacker.ai" }
  }[environment]
  const origin = z.url().parse(process.env.APP_URL || defaults.origin)
  if (deployed && new URL(origin).protocol !== "https:") {
    throw new Error("Deployed APP_URL must use HTTPS")
  }
  const bucket =
    process.env.CLOUDFLARE_DOCUMENTS_BUCKET || (production || preview ? undefined : "copacker-staging-private")
  const hyperdrive =
    process.env.CLOUDFLARE_HYPERDRIVE_ID || (production || preview ? undefined : "0a74043480fe42a6acdbf46b9572ef58")
  if (!bucket || !hyperdrive) {
    throw new Error("Deployment requires CLOUDFLARE_HYPERDRIVE_ID and CLOUDFLARE_DOCUMENTS_BUCKET")
  }
  if (preview && bucket !== "copacker-staging-private") {
    throw new Error("PR previews require the private staging bucket")
  }
  return {
    worker: {
      name: defaults.name,
      entrypoint: fileURLToPath(new URL("./src/server.ts", import.meta.url)),
      workersDev: !production,
      previewUrls: false,
      // Attaching a hostname is a separate, explicit cutover setting.
      domains: (preview ? "" : process.env.CLOUDFLARE_DOMAINS || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      compatibilityDate: "2026-10-15",
      compatibilityFlags: ["nodejs_compat"],
      limits: { cpuMs: 300000 },
      exports: preview ? undefined : { JobWorkflow: exports.workflow({ name: `${defaults.name}-jobs` }) },
      observability: { enabled: true, traces: { enabled: true }, redactQueryString: true },
      triggers: executor
        ? [
            triggers.queue({
              name: executorQueue,
              deadLetterQueue: `${executorQueue}-dlq`,
              maxBatchSize: 1,
              maxConcurrency: 3,
              maxRetries: 5,
              retryDelay: 30
            })
          ]
        : [],
      env: {
        ...Object.fromEntries(
          [...workerSettings, "APP_COMMIT_SHA"].map((name) => [name, bindings.text(process.env[name] || "")])
        ),
        ...Object.fromEntries(
          optionalSecrets.filter((name) => process.env[name]).map((name) => [name, bindings.secret()])
        ),
        APP_URL: bindings.text(new URL(origin).origin),
        DEPLOYMENT_ENV: bindings.text(environment),
        COPACKER_LOCAL: bindings.text(deployed ? "" : "1"),
        JOBS: preview ? bindings.queue<string>({ name: preview.queue }) : undefined,
        EXECUTOR_JOBS: executor ? bindings.queue<string>({ name: executorQueue }) : undefined,
        JOB_WORKFLOW: preview
          ? undefined
          : bindings.workflow({
              name: `${defaults.name}-jobs`,
              worker: defaults.name,
              exportName: "JobWorkflow"
            }),
        DOCUMENTS_PREFIX: bindings.text(preview?.documentsPrefix || ""),
        DOCUMENTS: bindings.r2({
          name: bucket,
          ...(!deployed ? { dev: { experimentalS3Credentials: localStorage().credentials } } : {})
        }),
        HYPERDRIVE: bindings.hyperdrive({
          id: hyperdrive,
          ...(!deployed
            ? {
                dev: {
                  connectionString: process.env.DATABASE_URL || "postgres://copacker:copacker@127.0.0.1:54329/copacker"
                }
              }
            : {})
        }),
        WORKOS_CLIENT_ID: bindings.secret(),
        WORKOS_API_KEY: bindings.secret(),
        WORKOS_COOKIE_PASSWORD: bindings.secret(),
        WORKOS_COOKIE_NAME: bindings.text("wos-session"),
        WORKOS_REDIRECT_URI: bindings.text(`${new URL(origin).origin}/callback`),
        TOKEN_ENCRYPTION_KEY: bindings.secret()
      }
    }
  }
})
