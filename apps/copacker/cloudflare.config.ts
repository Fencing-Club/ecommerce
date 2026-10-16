import { fileURLToPath } from "node:url"
import { bindings, defineConfig } from "cf/config"
import { z } from "zod"
import { optionalSecrets, workerSettings } from "./scripts/cloudflare-environment.ts"
import { localStorage } from "./scripts/local-storage.ts"

export default defineConfig(({ mode }) => {
  const deployed = mode === "staging" || mode === "production"
  const production = mode === "production"
  const environment = deployed ? mode : "local"
  const defaults = {
    local: { name: "copacker-local", origin: "https://local.copacker.ai" },
    staging: { name: "copacker-staging", origin: "https://copacker-staging.hoa-preview.workers.dev" },
    production: { name: "copacker", origin: "https://copacker.ai" }
  }[environment]
  const origin = z.url().parse(process.env.APP_URL || defaults.origin)
  if (deployed && new URL(origin).protocol !== "https:") {
    throw new Error("Deployed APP_URL must use HTTPS")
  }
  const bucket = process.env.CLOUDFLARE_DOCUMENTS_BUCKET || (production ? undefined : "copacker-staging-private")
  const hyperdrive =
    process.env.CLOUDFLARE_HYPERDRIVE_ID || (production ? undefined : "0a74043480fe42a6acdbf46b9572ef58")
  if (!bucket || !hyperdrive) {
    throw new Error("Production requires CLOUDFLARE_HYPERDRIVE_ID and CLOUDFLARE_DOCUMENTS_BUCKET")
  }
  return {
    worker: {
      name: defaults.name,
      entrypoint: fileURLToPath(new URL("./src/server.ts", import.meta.url)),
      workersDev: !production,
      previewUrls: false,
      // Attaching a hostname is a separate, explicit cutover setting.
      domains: (process.env.CLOUDFLARE_DOMAINS || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      compatibilityDate: "2026-10-15",
      compatibilityFlags: ["nodejs_compat"],
      observability: { enabled: true, traces: { enabled: true }, redactQueryString: true },
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
